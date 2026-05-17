import { chat } from '../ai-provider.js';
import type { FastifyBaseLogger } from 'fastify';

export interface ExtractedEntity {
  name: string;
  type: 'Concept' | 'Person' | 'Term' | 'Formula';
  description: string;
}

export interface ExtractedRelation {
  source: string;
  target: string;
  type: 'IS_A' | 'PART_OF' | 'PREREQUISITE_OF' | 'RELATED_TO' | 'DERIVES_FROM' | 'CONTRASTS_WITH';
  description: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

const extractLogger: FastifyBaseLogger = {
  info: () => {},
  error: console.error,
  warn: console.warn,
  debug: () => {},
  trace: () => {},
  fatal: console.error,
  child: () => extractLogger,
  silent: () => {},
} as any;

export async function extractEntitiesAndRelations(
  text: string,
  model: string,
  userId: string
): Promise<ExtractionResult> {
  const prompt = `请从以下文本中提取知识实体和它们之间的关系。

文本：
${text.slice(0, 3000)}

输出 JSON：
{
  "entities": [
    { "name": "实体名称", "type": "Concept|Person|Term|Formula", "description": "一句话描述" }
  ],
  "relations": [
    { "source": "实体A", "target": "实体B", "type": "IS_A|PART_OF|PREREQUISITE_OF|RELATED_TO|DERIVES_FROM|CONTRASTS_WITH", "description": "关系描述" }
  ]
}

只输出 JSON，不要其他内容。`;

  try {
    const response = await chat(userId, {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 2000,
    }, extractLogger);

    const parsed = JSON.parse(response.content);
    return {
      entities: parsed.entities || [],
      relations: parsed.relations || [],
    };
  } catch (err) {
    extractLogger.error({ err }, 'Entity extraction failed');
    return { entities: [], relations: [] };
  }
}
