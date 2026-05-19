import { updateJobStatus } from './job-service.js';
import { extractEntitiesAndRelations } from '../graphrag/extract.js';
import { chat } from '../ai-provider.js';
import type { FastifyBaseLogger } from 'fastify';
import { createHash } from 'crypto';

export interface ExtractionOutput {
  summary?: string;
  cards: Array<{ front: string; back: string }>;
  entities: Array<{ name: string; type: string; description: string }>;
  relations: Array<{ source: string; target: string; type: string }>;
}

interface ExtractionProcessMeta {
  inputSnapshot?: {
    contentLength: number;
    contentHash: string;
    preview: string;
  };
  duplicateSource?: boolean;
  previousJobIds?: string[];
  version?: number;
}

const processorLogger: FastifyBaseLogger = {
  info: (...args: any[]) => console.log('[知识提炼]', ...args),
  error: (...args: any[]) => console.error('[知识提炼]', ...args),
  warn: (...args: any[]) => console.warn('[知识提炼]', ...args),
  debug: (...args: any[]) => console.log('[知识提炼:调试]', ...args),
  trace: (...args: any[]) => console.log('[知识提炼:追踪]', ...args),
  fatal: (...args: any[]) => console.error('[知识提炼:致命]', ...args),
  child: () => processorLogger,
  silent: () => {},
} as any;

function parseJsonObject(text: string): any {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('No JSON object found in model response');
  }
}

function normalizeCards(cards: unknown): Array<{ front: string; back: string }> {
  if (!Array.isArray(cards)) return [];

  return cards
    .map((card: any) => ({
      front: String(card?.front ?? '').trim(),
      back: String(card?.back ?? '').trim(),
    }))
    .filter(card => card.front.length > 0 && card.back.length > 0)
    .slice(0, 20);
}

function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/[ \u00a0]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function pushLog(
  logs: any[],
  step: string,
  status: 'started' | 'completed' | 'failed',
  startedAt: number,
  detail: Record<string, unknown> = {}
) {
  logs.push({
    step,
    status,
    timestamp: new Date(),
    detail,
    duration_ms: Date.now() - startedAt,
  });
}

export async function processExtraction(
  jobId: string,
  _sourceType: string,
  _sourceId: string,
  content: string,
  userId: string,
  model?: string,
  meta: ExtractionProcessMeta = {}
): Promise<void> {
  const logs: any[] = [];
  const start = Date.now();

  try {
    // Get default model if not provided
    let useModel = model;
    if (!useModel) {
      const { getDefaultChatModel } = await import('../ai-provider.js');
      const defaultConfig = await getDefaultChatModel(userId);
      useModel = defaultConfig.model;
    }

    // Step 1: Preprocess
    await updateJobStatus(jobId, 'preprocessing', 'preprocess', logs);
    const preprocessStart = Date.now();
    pushLog(logs, 'preprocess', 'started', preprocessStart, {
      source_type: _sourceType,
      source_id: _sourceId,
      input_snapshot: meta.inputSnapshot,
      duplicate_source: meta.duplicateSource ?? false,
      previous_job_count: meta.previousJobIds?.length ?? 0,
      version: meta.version ?? 1,
    });
    const normalized = normalizeContent(content);
    const preprocessed = normalized.slice(0, 8000);
    pushLog(logs, 'preprocess', 'completed', preprocessStart, {
      original_length: content.length,
      normalized_length: normalized.length,
      processed_length: preprocessed.length,
      truncated: normalized.length > preprocessed.length,
      processed_hash: hashContent(preprocessed),
    });

    // Step 2: Extract entities/relations
    await updateJobStatus(jobId, 'extracting', 'extract', logs);
    const extractStart = Date.now();
    pushLog(logs, 'extract', 'started', extractStart, { model: useModel });
    const extracted = await extractEntitiesAndRelations(preprocessed, useModel, userId);
    pushLog(logs, 'extract', 'completed', extractStart, {
      entity_count: extracted.entities.length,
      relation_count: extracted.relations.length,
      warning: extracted.entities.length === 0
        ? '未提取到实体关系；可能是模型输出为空、JSON 修复失败，或原文缺少可结构化概念。'
        : undefined,
    });

    // Step 3: Generate summary and cards
    await updateJobStatus(jobId, 'generating', 'generate', logs);
    const genStart = Date.now();
    pushLog(logs, 'generate', 'started', genStart, { model: useModel });
    const output = await generateSummaryAndCards(preprocessed, extracted, useModel, userId);
    pushLog(logs, 'generate', 'completed', genStart, {
      summary_length: output.summary?.length,
      card_count: output.cards.length,
      entity_count: output.entities.length,
      relation_count: output.relations.length,
    });

    // Save output
    await updateJobStatus(jobId, 'completed', undefined, logs, {
      ...output,
      meta: {
        sourceType: _sourceType,
        sourceId: _sourceId,
        inputSnapshot: meta.inputSnapshot,
        duplicateSource: meta.duplicateSource ?? false,
        previousJobIds: meta.previousJobIds ?? [],
        version: meta.version ?? 1,
      },
    } as any);

  } catch (err) {
    pushLog(logs, 'process', 'failed', start, {
      source_type: _sourceType,
      source_id: _sourceId,
      error: (err as Error).message,
    });
    await updateJobStatus(jobId, 'failed', undefined, logs, undefined, (err as Error).message);
  }
}

async function generateSummaryAndCards(
  content: string,
  extracted: any,
  model: string,
  userId: string
): Promise<ExtractionOutput> {
  const prompt = `请基于以下文本生成笔记摘要和闪卡。

文本：
${content.slice(0, 5000)}

已提取的概念：${extracted.entities.map((e: any) => e.name).join('、')}

输出 JSON：
{
  "summary": "200-500字的笔记摘要",
  "cards": [
    { "front": "问题", "back": "答案" }
  ]
}

生成 2-5 张闪卡。只输出 JSON。`;

  try {
    const response = await chat(userId, {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 2000,
    }, processorLogger);

    const parsed = parseJsonObject(response.content);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      cards: normalizeCards(parsed.cards),
      entities: extracted.entities,
      relations: extracted.relations,
    };
  } catch {
    return {
      summary: '',
      cards: [],
      entities: extracted.entities,
      relations: extracted.relations,
    };
  }
}
