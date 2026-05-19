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

const ENTITY_TYPES = new Set(['Concept', 'Person', 'Term', 'Formula']);
const RELATION_TYPES = new Set([
  'IS_A',
  'PART_OF',
  'PREREQUISITE_OF',
  'RELATED_TO',
  'DERIVES_FROM',
  'CONTRASTS_WITH',
]);

const extractLogger: FastifyBaseLogger = {
  info: (...args: any[]) => console.log('[图谱抽取]', ...args),
  error: (...args: any[]) => console.error('[图谱抽取]', ...args),
  warn: (...args: any[]) => console.warn('[图谱抽取]', ...args),
  debug: (...args: any[]) => console.log('[图谱抽取:调试]', ...args),
  trace: (...args: any[]) => console.log('[图谱抽取:追踪]', ...args),
  fatal: (...args: any[]) => console.error('[图谱抽取:致命]', ...args),
  child: () => extractLogger,
  silent: () => {},
} as any;

function stripJsonFences(text: string): string {
  return text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function sliceLikelyJson(text: string): string {
  const cleaned = stripJsonFences(text);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

function parseExtractionJson(text: string): ExtractionResult {
  const parsed = JSON.parse(sliceLikelyJson(text));
  return normalizeExtractionResult(parsed);
}

function normalizeExtractionResult(parsed: any): ExtractionResult {
  const entities = Array.isArray(parsed?.entities)
    ? parsed.entities
      .map((entity: any) => ({
        name: String(entity?.name ?? '').trim(),
        type: ENTITY_TYPES.has(entity?.type) ? entity.type : 'Concept',
        description: String(entity?.description ?? '').trim(),
      }))
      .filter((entity: ExtractedEntity) => entity.name.length > 0)
      .slice(0, 30)
    : [];

  const entityNames = new Set(entities.map((entity: ExtractedEntity) => entity.name));

  const relations = Array.isArray(parsed?.relations)
    ? parsed.relations
      .map((relation: any) => ({
        source: String(relation?.source ?? '').trim(),
        target: String(relation?.target ?? '').trim(),
        type: RELATION_TYPES.has(relation?.type) ? relation.type : 'RELATED_TO',
        description: String(relation?.description ?? '').trim(),
      }))
      .filter((relation: ExtractedRelation) =>
        relation.source.length > 0 &&
        relation.target.length > 0 &&
        relation.source !== relation.target &&
        (entityNames.size === 0 || (entityNames.has(relation.source) && entityNames.has(relation.target)))
      )
      .slice(0, 50)
    : [];

  return { entities, relations };
}

async function repairExtractionJson(
  raw: string,
  model: string,
  userId: string
): Promise<ExtractionResult> {
  const response = await chat(userId, {
    model,
    messages: [{
      role: 'user',
      content: `下面是一段可能被截断或格式错误的 JSON。请修复为严格合法 JSON。

要求：
1. 只输出 JSON，不要 Markdown。
2. 顶层必须包含 entities 和 relations 两个数组。
3. entities 每项包含 name、type、description。
4. relations 每项包含 source、target、type、description。
5. 如果某项无法修复就删除，不要编造文本外信息。

待修复内容：
${raw.slice(0, 12000)}`,
    }],
    temperature: 0,
    maxTokens: 4000,
  }, extractLogger);

  return parseExtractionJson(response.content);
}

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

约束：
- 最多输出 30 个实体、50 条关系。
- description 尽量短，一句话以内。
- 只输出严格 JSON，不要 Markdown，不要解释，不要尾随逗号。`;

  try {
    const response = await chat(userId, {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 4000,
    }, extractLogger);

    try {
      return parseExtractionJson(response.content);
    } catch (parseErr) {
      extractLogger.warn({
        err: parseErr,
        rawLength: response.content.length,
        preview: response.content.slice(0, 300),
      }, '实体关系 JSON 解析失败，尝试自动修复');
      return await repairExtractionJson(response.content, model, userId);
    }
  } catch (err) {
    extractLogger.error({ err }, '实体关系抽取失败');
    return { entities: [], relations: [] };
  }
}
