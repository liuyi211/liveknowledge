import { z } from 'zod';
import { db } from '../db/index.js';
import { chatSessions, personas } from '../db/schema.js';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { chat, getDefaultChatModel } from './ai-provider.js';
import type { FastifyBaseLogger } from 'fastify';

export interface LightweightPersonaConfig {
  domains: string[];
  responseStyle: string[];
  questionStyle: string[];
  reminders: string[];
  tone: string[];
}

export interface BuiltinPersona {
  name: string;
  description: string;
  config: LightweightPersonaConfig;
}

export const BUILTIN_PERSONAS: BuiltinPersona[] = [
  {
    name: '算法导师',
    description: '专注数据结构与算法，擅长解题建模、复杂度分析和代码思路拆解。',
    config: {
      domains: ['数据结构与算法', '复杂度分析', '动态规划', '图论', '搜索', '贪心', '算法题代码实现'],
      responseStyle: [
        '概念题按「直觉解释 -> 正式定义 -> 例子 -> 易混点」组织。',
        '算法题按「题意抽象 -> 关键观察 -> 解法步骤 -> 复杂度 -> 边界条件」组织。',
        '代码问题按「错误定位 -> 原因解释 -> 修改建议 -> 测试用例」组织。',
        '如果用户像是在刷题，不要一上来剧透完整答案，先给能推进思考的提示。',
      ],
      questionStyle: [
        '题目条件不清时，优先追问输入规模、目标语言或用户卡点。',
        '最多追问 1-2 个关键问题。',
        '如果信息已足够，直接推进解法并标出假设。',
      ],
      reminders: [
        '明确区分直觉解释和严格证明。',
        '涉及算法时说明时间复杂度和空间复杂度。',
        '涉及代码时提醒边界条件和反例测试。',
      ],
      tone: ['严谨', '耐心', '启发式', '像竞赛/面试导师但不压迫'],
    },
  },
  {
    name: '论文教授',
    description: '适合论文阅读、研究问题拆解、方法论分析和学术写作反馈。',
    config: {
      domains: ['论文阅读', '研究方法', '实验设计', '学术写作', 'Related Work 梳理', '方法与贡献分析'],
      responseStyle: [
        '论文解读按「研究问题 -> 核心贡献 -> 方法框架 -> 实验设计 -> 局限与可追问点」组织。',
        '写作反馈按「论点清晰度 -> 证据充分性 -> 结构问题 -> 修改建议」组织。',
        '方法比较按「假设前提 -> 适用场景 -> 优势 -> 代价/局限」组织。',
        '优先帮助用户建立论文的研究脉络，而不是只复述摘要。',
      ],
      questionStyle: [
        '当研究目标不清时，追问用户是要快速理解、精读复现、写综述还是找创新点。',
        '当论文信息不足时，追问标题、摘要、方法段或实验设置中最缺的一项。',
        '追问要服务于缩小研究问题，不做泛泛确认。',
      ],
      reminders: [
        '区分论文作者的结论、检索材料中的证据和自己的推断。',
        '指出方法成立依赖的假设和可能的外部有效性问题。',
        '涉及学术评价时避免过度断言，保留不确定性。',
      ],
      tone: ['学术', '克制', '批判性', '循循善诱'],
    },
  },
];

const BUILTIN_NAMES = BUILTIN_PERSONAS.map((persona) => persona.name);

export function buildPersonaPrompt(
  name: string,
  description: string | null | undefined,
  config: LightweightPersonaConfig
): string {
  const section = (title: string, items: string[]) => items.length
    ? `${title}：\n${items.map((item) => `- ${item}`).join('\n')}`
    : '';

  return [
    `你正在扮演「${name}」。`,
    description ? `角色定位：${description}` : '',
    section('擅长领域', config.domains),
    section('回复结构', config.responseStyle),
    section('追问策略', config.questionStyle),
    section('提醒', config.reminders),
    section('表达风格', config.tone),
    '请用中文回答。人格只影响解释方式和组织结构；本地知识库检索结果仍然优先作为事实依据。',
  ].filter(Boolean).join('\n\n');
}

export function teachingStyleFromConfig(config: LightweightPersonaConfig) {
  return {
    responseStyle: config.responseStyle,
    questionStyle: config.questionStyle,
    reminders: config.reminders,
    tone: config.tone,
  };
}

export async function cleanupObsoleteBuiltinPersonasForUser(userId: string) {
  const obsoletePersonas = await db.select({ id: personas.id }).from(personas)
    .where(and(
      eq(personas.userId, userId),
      eq(personas.isBuiltin, true),
      notInArray(personas.name, BUILTIN_NAMES)
    ));

  if (obsoletePersonas.length === 0) return;

  const obsoleteIds = obsoletePersonas.map((persona) => persona.id);
  await db.update(chatSessions)
    .set({ personaId: null, updatedAt: new Date() })
    .where(and(eq(chatSessions.userId, userId), inArray(chatSessions.personaId, obsoleteIds)));

  await db.delete(personas)
    .where(and(eq(personas.userId, userId), inArray(personas.id, obsoleteIds)));
}

export async function ensureBuiltinPersonasForUser(userId: string) {
  await cleanupObsoleteBuiltinPersonasForUser(userId);

  const existing = await db.select().from(personas)
    .where(and(eq(personas.userId, userId), eq(personas.isBuiltin, true)));

  const existingNames = new Set(existing.map((persona) => persona.name));
  const missing = BUILTIN_PERSONAS.filter((persona) => !existingNames.has(persona.name));
  if (missing.length === 0) return;

  await db.insert(personas).values(missing.map((persona) => ({
    userId,
    name: persona.name,
    description: persona.description,
    systemPromptTemplate: buildPersonaPrompt(persona.name, persona.description, persona.config),
    teachingStyle: teachingStyleFromConfig(persona.config),
    knowledgeDomains: persona.config.domains,
    isBuiltin: true,
    defaultModel: null,
  })));
}

const generatedPersonaSchema = z.object({
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(200),
  domains: z.array(z.string().min(1)).min(1).max(8),
  responseStyle: z.array(z.string().min(1)).min(2).max(6),
  questionStyle: z.array(z.string().min(1)).min(1).max(5),
  reminders: z.array(z.string().min(1)).min(1).max(5),
  tone: z.array(z.string().min(1)).min(1).max(6),
});

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型没有返回可解析的 JSON');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export async function generatePersonaFromDescription(
  userId: string,
  description: string,
  log: FastifyBaseLogger
) {
  const defaultConfig = await getDefaultChatModel(userId);
  const response = await chat(userId, {
    model: defaultConfig.model,
    providerType: defaultConfig.providerType,
    temperature: 0.2,
    maxTokens: 900,
    messages: [{
      role: 'user',
      content: [
        '你是本地知识库产品的人格配置生成器。请根据用户给出的一段角色描述，生成轻量 persona 配置。',
        '要求：',
        '1. 只输出 JSON，不要 Markdown。',
        '2. 不要生成工具调用策略，不要生成安全长规则。',
        '3. 字段要短、可直接拼入 system prompt。',
        '4. responseStyle/questionStyle/reminders/tone 使用中文短句。',
        '',
        'JSON schema:',
        '{',
        '  "name": "角色名称，2-8 个中文字符优先",',
        '  "description": "一句话角色定位",',
        '  "domains": ["擅长领域"],',
        '  "responseStyle": ["回复结构偏好"],',
        '  "questionStyle": ["追问策略"],',
        '  "reminders": ["回答提醒"],',
        '  "tone": ["表达风格关键词"]',
        '}',
        '',
        `用户角色描述：${description}`,
      ].join('\n'),
    }],
  }, log);

  const parsed = generatedPersonaSchema.parse(extractJson(response.content));
  const personaConfig: LightweightPersonaConfig = {
    domains: parsed.domains,
    responseStyle: parsed.responseStyle,
    questionStyle: parsed.questionStyle,
    reminders: parsed.reminders,
    tone: parsed.tone,
  };

  return {
    name: parsed.name,
    description: parsed.description,
    config: personaConfig,
    systemPromptTemplate: buildPersonaPrompt(parsed.name, parsed.description, personaConfig),
    teachingStyle: teachingStyleFromConfig(personaConfig),
    knowledgeDomains: personaConfig.domains,
  };
}
