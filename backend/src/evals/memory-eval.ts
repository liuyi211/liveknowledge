import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatSessions, conversationMemories, embeddings, messages } from '../db/schema.js';
import { generateEmbedding, getModelCapability } from '../services/ai-provider.js';
import { assembleChatContext } from '../services/context-assembly-service.js';
import { estimateTokens } from '../services/context-budget-service.js';
import {
  extractLongTermMemoriesAfterTurn,
  formatMemoriesForPrompt,
  retrieveRelevantMemories,
} from '../services/long-term-memory-service.js';
import { rewriteQuery } from '../services/retrieval/query-rewrite.js';

dotenv.config();

type Role = 'user' | 'assistant';
type MemoryType = 'preference' | 'goal' | 'fact' | 'decision' | 'open_question' | 'concept' | 'correction';
type CaseCategory = 'coreference' | 'memory_recall' | 'memory_extraction' | 'overflow';

interface EvalMessage {
  role: Role;
  content: string;
  repeat?: number;
}

interface SeedMemory {
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
}

interface MemoryEvalCase {
  id: string;
  category: CaseCategory;
  history: EvalMessage[];
  query: string;
  sessionSummary?: string;
  seedMemories?: SeedMemory[];
  expectedRewriteContains?: string[];
  expectedMemoryContains?: string[];
  expectedExtractedMemoryContains?: string[];
  expectedAnswerContextContains?: string[];
}

interface CliOptions {
  casesPath: string;
  model: string;
  userId: string;
  json: boolean;
  keepData: boolean;
  category?: CaseCategory;
  limit?: number;
}

interface CaseResult {
  id: string;
  category: CaseCategory;
  baselineCoreferenceHit: boolean | null;
  rewriteCoreferenceHit: boolean | null;
  baselineOverflow: boolean;
  enhancedOverflow: boolean;
  compressionRatio: number | null;
  memoryRecallHit: boolean | null;
  memoryExtractionHit: boolean | null;
  contextInjectionHit: boolean | null;
  rewrittenQuery?: string;
  promptTokens: number;
  contextWindow: number;
  notes: string[];
}

const DEFAULT_CASES_PATH = path.resolve(process.cwd(), '..', 'docs', 'evals', 'memory_eval_cases.json');
const DEFAULT_MODEL = 'moonshot-v1-8k';
const EVAL_TITLE_PREFIX = '[eval] memory';
const MEMORY_SOURCE_TYPE = 'conversation_memory';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = filterCases(await loadCases(options.casesPath), options);
  const results: CaseResult[] = [];

  for (const testCase of cases) {
    results.push(await evaluateCase(testCase, options));
  }

  const report = buildReport(results, options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  process.exit(0);
}

async function evaluateCase(testCase: MemoryEvalCase, options: CliOptions): Promise<CaseResult> {
  const notes: string[] = [];
  const createdMemoryIds: string[] = [];
  let sessionId: string | null = null;

  try {
    sessionId = await createEvalSession(options.userId, options.model, testCase);
    const messageIds = await insertHistory(sessionId, testCase.history);
    await updateSessionSummary(sessionId, testCase.sessionSummary || null);

    if (testCase.seedMemories?.length) {
      const memoryIds = await seedMemories(options.userId, sessionId, testCase.seedMemories);
      createdMemoryIds.push(...memoryIds);
    }

    let rewrittenQuery: string | undefined;
    let rewriteCoreferenceHit: boolean | null = null;
    if (testCase.expectedRewriteContains?.length) {
      const rewritten = await rewriteQuery(testCase.query, options.userId, testCase.sessionSummary);
      rewrittenQuery = [
        rewritten.rewrittenQuery,
        rewritten.keywords.join(' '),
        rewritten.subQueries.join(' '),
      ].filter(Boolean).join('\n');
      rewriteCoreferenceHit = containsAll(rewrittenQuery, testCase.expectedRewriteContains);
    }

    let memoryRecallHit: boolean | null = null;
    if (testCase.expectedMemoryContains?.length) {
      const memories = await retrieveRelevantMemories(options.userId, testCase.query, testCase.sessionSummary, 8);
      const prompt = formatMemoriesForPrompt(memories, 1500);
      memoryRecallHit = containsAll(prompt, testCase.expectedMemoryContains);
    }

    let memoryExtractionHit: boolean | null = null;
    if (testCase.expectedExtractedMemoryContains?.length) {
      await extractLongTermMemoriesAfterTurn(options.userId, sessionId, messageIds, evalLogger);
      const extracted = await db.select().from(conversationMemories)
        .where(and(eq(conversationMemories.userId, options.userId), eq(conversationMemories.sessionId, sessionId)));
      createdMemoryIds.push(...extracted.map(memory => memory.id));
      memoryExtractionHit = containsAll(
        extracted.map(memory => memory.content).join('\n'),
        testCase.expectedExtractedMemoryContains
      );
    }

    const assembled = await assembleChatContext({
      userId: options.userId,
      sessionId,
      query: testCase.query,
      model: options.model,
      attachmentTexts: [],
      log: evalLogger,
    });

    const promptTokens = estimateChatTokens(assembled.messages);
    const contextWindow = getContextWindow(options.model);
    const baselineTokens = estimateTokens(formatHistory(testCase.history) + '\n' + testCase.query);
    const fullHistoryTokens = estimateTokens(formatHistory(testCase.history));
    const injectedHistoryTokens = estimateInjectedHistoryTokens(assembled.messages);
    const summaryTokens = estimateTokens(testCase.sessionSummary || '');
    const compressionRatio = fullHistoryTokens > 0
      ? round(1 - ((summaryTokens + injectedHistoryTokens) / fullHistoryTokens), 4)
      : null;

    const contextText = assembled.messages.map(message => stringifyContent(message.content)).join('\n');
    const contextInjectionHit = testCase.expectedAnswerContextContains?.length
      ? containsAll(contextText, testCase.expectedAnswerContextContains)
      : null;

    return {
      id: testCase.id,
      category: testCase.category,
      baselineCoreferenceHit: testCase.expectedRewriteContains?.length
        ? containsAll(testCase.query, testCase.expectedRewriteContains)
        : null,
      rewriteCoreferenceHit,
      baselineOverflow: baselineTokens > contextWindow,
      enhancedOverflow: promptTokens > contextWindow,
      compressionRatio,
      memoryRecallHit,
      memoryExtractionHit,
      contextInjectionHit,
      rewrittenQuery,
      promptTokens,
      contextWindow,
      notes,
    };
  } finally {
    if (!options.keepData && sessionId) {
      await cleanupEvalData(sessionId, createdMemoryIds);
    }
  }
}

async function createEvalSession(userId: string, model: string, testCase: MemoryEvalCase): Promise<string> {
  const [session] = await db.insert(chatSessions).values({
    userId,
    modelId: model,
    title: `${EVAL_TITLE_PREFIX}:${testCase.id}`,
    contextSummary: testCase.sessionSummary || null,
  }).returning();
  return session.id;
}

async function insertHistory(sessionId: string, history: EvalMessage[]): Promise<string[]> {
  const base = Date.now() - history.length * 1000;
  const rows = history.map((message, index) => ({
    sessionId,
    role: message.role,
    content: messageContent(message),
    createdAt: new Date(base + index * 1000),
  }));
  const inserted = await db.insert(messages).values(rows).returning({ id: messages.id });
  return inserted.map(row => row.id);
}

async function updateSessionSummary(sessionId: string, summary: string | null): Promise<void> {
  await db.update(chatSessions)
    .set({
      contextSummary: summary,
      contextSummaryUpdatedAt: summary ? new Date() : null,
      contextSummaryVersion: summary ? 1 : 0,
    })
    .where(eq(chatSessions.id, sessionId));
}

async function seedMemories(userId: string, sessionId: string, seed: SeedMemory[]): Promise<string[]> {
  const createdIds: string[] = [];
  for (const memory of seed) {
    const [created] = await db.insert(conversationMemories).values({
      userId,
      sessionId,
      type: memory.type,
      content: memory.content,
      normalizedContent: normalizeMemoryContent(memory.content),
      importance: memory.importance,
      confidence: memory.confidence,
      status: 'active',
      metadata: { source: 'eval-seed' },
    }).returning();
    createdIds.push(created.id);

    const vector = await generateEmbedding(memory.content, userId);
    await db.insert(embeddings).values({
      userId,
      sourceType: MEMORY_SOURCE_TYPE,
      sourceId: created.id,
      chunkIndex: 0,
      content: memory.content,
      metadata: {
        type: memory.type,
        importance: memory.importance,
        confidence: memory.confidence,
        sessionId,
        source: 'eval-seed',
      },
      embedding: vector,
    });
  }
  return createdIds;
}

async function cleanupEvalData(sessionId: string, memoryIds: string[]): Promise<void> {
  const uniqueMemoryIds = Array.from(new Set(memoryIds));
  if (uniqueMemoryIds.length > 0) {
    await db.delete(embeddings)
      .where(and(eq(embeddings.sourceType, MEMORY_SOURCE_TYPE), inArray(embeddings.sourceId, uniqueMemoryIds)));
    await db.delete(conversationMemories)
      .where(inArray(conversationMemories.id, uniqueMemoryIds));
  }
  await db.delete(messages).where(eq(messages.sessionId, sessionId));
  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
}

function buildReport(results: CaseResult[], options: CliOptions) {
  const coref = results.filter(result => result.category === 'coreference');
  const memoryRecall = results.filter(result => result.category === 'memory_recall');
  const memoryExtraction = results.filter(result => result.category === 'memory_extraction');
  const overflow = results.filter(result => result.category === 'overflow');

  return {
    meta: {
      mode: 'real',
      cases: results.length,
      userId: options.userId,
      model: options.model,
      keepData: options.keepData,
    },
    metrics: {
      baseline_coreference_accuracy: ratio(coref.filter(result => result.baselineCoreferenceHit).length, coref.length),
      rewrite_coreference_accuracy: ratio(coref.filter(result => result.rewriteCoreferenceHit).length, coref.length),
      baseline_context_overflow_rate: ratio(results.filter(result => result.baselineOverflow).length, results.length),
      enhanced_context_overflow_rate: ratio(results.filter(result => result.enhancedOverflow).length, results.length),
      average_overflow_case_compression_ratio: overflow.length
        ? round(overflow.reduce((sum, result) => sum + (result.compressionRatio || 0), 0) / overflow.length, 4)
        : null,
      memory_recall_accuracy: ratio(memoryRecall.filter(result => result.memoryRecallHit).length, memoryRecall.length),
      memory_extraction_accuracy: ratio(memoryExtraction.filter(result => result.memoryExtractionHit).length, memoryExtraction.length),
      context_injection_accuracy: ratio(
        results.filter(result => result.contextInjectionHit !== null && result.contextInjectionHit).length,
        results.filter(result => result.contextInjectionHit !== null).length
      ),
    },
    results,
  };
}

function printReport(report: ReturnType<typeof buildReport>) {
  console.log('\nReal memory eval report');
  console.log('=======================');
  console.log(`userId: ${report.meta.userId}`);
  console.log(`model: ${report.meta.model}`);
  console.log(`cases: ${report.meta.cases}`);
  console.log('');
  for (const [key, value] of Object.entries(report.metrics)) {
    console.log(`${key}: ${formatMetric(value)}`);
  }
  console.log('\nCase results');
  for (const result of report.results) {
    console.log(`- ${result.id}: rewrite=${formatBool(result.rewriteCoreferenceHit)} memoryRecall=${formatBool(result.memoryRecallHit)} memoryExtract=${formatBool(result.memoryExtractionHit)} overflow=${formatBool(result.baselineOverflow)}->${formatBool(result.enhancedOverflow)} prompt=${result.promptTokens}/${result.contextWindow}`);
    if (result.rewrittenQuery) console.log(`  rewritten: ${result.rewrittenQuery.replace(/\n/g, ' | ')}`);
    for (const note of result.notes) console.log(`  note: ${note}`);
  }
}

async function loadCases(casesPath: string): Promise<MemoryEvalCase[]> {
  const raw = await fs.readFile(casesPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Eval cases file must be a JSON array');
  }
  return parsed;
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    casesPath: DEFAULT_CASES_PATH,
    model: DEFAULT_MODEL,
    json: false,
    keepData: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--cases') options.casesPath = path.resolve(args[++i]);
    else if (arg === '--model') options.model = args[++i];
    else if (arg === '--user-id') options.userId = args[++i];
    else if (arg === '--json') options.json = true;
    else if (arg === '--keep-data') options.keepData = true;
    else if (arg === '--category') options.category = parseCategory(args[++i]);
    else if (arg === '--limit') options.limit = Number(args[++i]);
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.userId) {
    printHelp();
    throw new Error('Real memory eval requires --user-id. It uses database rows and configured chat/embedding providers.');
  }

  return options as CliOptions;
}

function printHelp() {
  console.log(`Usage:
  npm run eval:memory -- --user-id <uuid>
  npm run eval:memory -- --user-id <uuid> --json
  npm run eval:memory -- --user-id <uuid> --model moonshot-v1-8k
  npm run eval:memory -- --user-id <uuid> --category coreference --limit 20
  npm run eval:memory -- --user-id <uuid> --keep-data

Requirements:
  1. DATABASE_URL points to a migrated LiveKnowledge database.
  2. The user has active chat and embedding provider configs.
  3. Migration 0015_add_memory_system.sql has been applied.
`);
}

function filterCases(cases: MemoryEvalCase[], options: CliOptions): MemoryEvalCase[] {
  let result = cases;
  if (options.category) {
    result = result.filter(testCase => testCase.category === options.category);
  }
  if (options.limit && Number.isFinite(options.limit) && options.limit > 0) {
    result = result.slice(0, options.limit);
  }
  return result;
}

function parseCategory(value: string): CaseCategory {
  if (value === 'coreference' || value === 'memory_recall' || value === 'memory_extraction' || value === 'overflow') {
    return value;
  }
  throw new Error(`Unknown category: ${value}`);
}

function estimateChatTokens(chatMessages: Array<{ content: string | unknown[] }>): number {
  return chatMessages.reduce((sum, message) => sum + estimateTokens(stringifyContent(message.content)) + 8, 0);
}

function estimateInjectedHistoryTokens(chatMessages: Array<{ role?: string; content: string | unknown[] }>): number {
  const historyMessages = chatMessages.slice(1, -1);
  return historyMessages.reduce((sum, message) => sum + estimateTokens(stringifyContent(message.content)), 0);
}

function formatHistory(history: EvalMessage[]): string {
  return history.map(message => `${message.role}: ${messageContent(message)}`).join('\n');
}

function messageContent(message: EvalMessage): string {
  return message.repeat && message.repeat > 1
    ? Array.from({ length: message.repeat }, () => message.content).join('')
    : message.content;
}

function stringifyContent(content: string | unknown[]): string {
  if (typeof content === 'string') return content;
  return JSON.stringify(content);
}

function containsAll(text: string, values: string[]): boolean {
  const normalized = text.toLowerCase();
  return values.every(value => normalized.includes(value.toLowerCase()));
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return round(numerator / denominator, 4);
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function formatMetric(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 10000) / 100}%`;
}

function formatBool(value: boolean | null): string {
  if (value === null) return 'n/a';
  return value ? 'yes' : 'no';
}

function getContextWindow(model: string): number {
  return getModelCapability(model)?.contextWindow || 8192;
}

function normalizeMemoryContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase();
}

const evalLogger = {
  info: () => {},
  error: console.error,
  warn: console.warn,
  debug: () => {},
  trace: () => {},
  fatal: console.error,
  child: () => evalLogger,
  silent: () => {},
} as any;

main().catch(err => {
  console.error(err);
  process.exit(1);
});
