import { updateJobStatus } from './job-service.js';
import { extractEntitiesAndRelations } from '../graphrag/extract.js';
import { chat } from '../ai-provider.js';
import type { FastifyBaseLogger } from 'fastify';

export interface ExtractionOutput {
  summary?: string;
  cards: Array<{ front: string; back: string }>;
  entities: Array<{ name: string; type: string; description: string }>;
  relations: Array<{ source: string; target: string; type: string }>;
}

const processorLogger: FastifyBaseLogger = {
  info: () => {},
  error: console.error,
  warn: console.warn,
  debug: () => {},
  trace: () => {},
  fatal: console.error,
  child: () => processorLogger,
  silent: () => {},
} as any;

export async function processExtraction(
  jobId: string,
  _sourceType: string,
  _sourceId: string,
  content: string,
  userId: string,
  model?: string
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
    const preprocessed = content.slice(0, 8000);
    logs.push({
      step: 'preprocess',
      status: 'completed',
      timestamp: new Date(),
      detail: { original_length: content.length },
      duration_ms: Date.now() - start,
    });

    // Step 2: Extract entities/relations
    await updateJobStatus(jobId, 'extracting', 'extract', logs);
    const extractStart = Date.now();
    const extracted = await extractEntitiesAndRelations(preprocessed, useModel, userId);
    logs.push({
      step: 'extract',
      status: 'completed',
      timestamp: new Date(),
      detail: { entity_count: extracted.entities.length, relation_count: extracted.relations.length },
      duration_ms: Date.now() - extractStart,
    });

    // Step 3: Generate summary and cards
    await updateJobStatus(jobId, 'generating', 'generate', logs);
    const genStart = Date.now();
    const output = await generateSummaryAndCards(preprocessed, extracted, useModel, userId);
    logs.push({
      step: 'generate',
      status: 'completed',
      timestamp: new Date(),
      detail: { summary_length: output.summary?.length, card_count: output.cards.length },
      duration_ms: Date.now() - genStart,
    });

    // Save output
    await updateJobStatus(jobId, 'completed', undefined, logs, output as any);

  } catch (err) {
    logs.push({
      step: 'process',
      status: 'failed',
      timestamp: new Date(),
      detail: { error: (err as Error).message },
      duration_ms: Date.now() - start,
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

    const parsed = JSON.parse(response.content);
    return {
      summary: parsed.summary,
      cards: parsed.cards || [],
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
