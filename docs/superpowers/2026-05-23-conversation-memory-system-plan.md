# 对话记忆系统设计方案与实施计划 — 2026-05-23

> 目标：把每轮对话上下文组装升级为稳定的分层记忆系统：
>
> `System Persona + 用户认知画像摘要 + 当前会话滚动摘要 + 相关长期记忆 + 知识库 RAG 检索结果 + 最近 N 轮原文消息 + 当前用户输入`

---

## 1. 当前现状

当前项目已经具备一部分基础能力，但还没有形成完整的对话记忆系统。

| 能力 | 当前状态 | 主要问题 |
| --- | --- | --- |
| System Persona | 已有，`chat_sessions.persona_id` 关联 `personas` | 可继续复用 |
| 用户认知画像摘要 | 已有，`getProfileSummary(userId)` 会注入 system prompt | 可继续复用，但应纳入统一上下文预算 |
| 当前会话摘要 | 已有 `chat_sessions.context_summary` | 主要在切换导师人格时生成，不是每轮自动滚动更新 |
| 长期记忆 | 未独立建模 | 用户偏好、长期目标、事实、待办无法稳定沉淀 |
| 知识库 RAG | 已有 `retrieveContext()` | 只检索知识库/图谱，不负责用户长期记忆 |
| 最近原文消息 | 已有 `buildChatMessages()` | 当前固定 `limit(20)`，且按 `createdAt` 正序会取最早 20 条，不是最近 20 条 |
| 当前用户输入 | 已有 | 需要参与预算分配和 query rewrite |

需要先把“会话上下文拼接”从零散逻辑改成一个明确的 `Context Assembly Pipeline`。

---

## 2. 设计原则

1. **分层记忆**：短期原文、会话摘要、长期记忆、知识库资料分开存储和注入，避免混在一个 prompt 里不可控。
2. **本地优先**：所有记忆数据写入本地 PostgreSQL/pgvector，用户可以查看、编辑、删除。
3. **可降级**：LLM 摘要、长期记忆提取、RAG 任意一步失败时，对话仍能依靠最近消息继续。
4. **可追溯**：长期记忆必须记录来源消息、置信度、更新时间、最后使用时间。
5. **预算驱动**：不要固定最近 20 条；按模型上下文窗口、附件长度、RAG 长度、摘要长度动态分配。
6. **不自动污染知识库**：长期记忆与正式笔记分开。只有用户确认或提炼采纳后，才进入 notes/cards/concepts。

---

## 3. 目标上下文结构

每轮调用模型前，后端组装如下结构：

```text
1. System Persona
   - 当前导师人格 prompt
   - 没有人格时使用默认通用助手 prompt

2. 用户认知画像摘要
   - 学习风格
   - 领域掌握
   - 记忆参数
   - 当前建议

3. 当前会话滚动摘要
   - 本会话长期目标
   - 已讨论结论
   - 未解决问题
   - 关键约定和上下文

4. 相关长期记忆
   - 用户偏好
   - 长期目标
   - 已确认事实
   - 决策记录
   - 待跟进问题

5. 知识库 RAG 检索结果
   - notes/import/document/conversation chunks
   - 知识图谱关系路径
   - GraphRAG 社区摘要

6. 最近 N 轮原文消息
   - 最近若干 user/assistant 消息
   - 按 token budget 截断

7. 当前用户输入
   - 文本
   - 图片
   - 文件解析内容
```

最终模型 messages 保持 OpenAI-compatible 格式：

```ts
[
  { role: 'system', content: assembledSystemPrompt },
  ...recentHistoryMessages,
  { role: 'user', content: currentUserContentOrMultimodalParts }
]
```

---

## 4. 数据模型设计

### 4.1 扩展 chat_sessions

当前已有 `context_summary`，建议补齐摘要边界字段，避免重复总结旧消息。

```ts
export const chatSessions = pgTable('chat_sessions', {
  // existing fields...
  contextSummary: text('context_summary'),
  contextSummaryUpdatedAt: timestamp('context_summary_updated_at'),
  contextSummaryUpToMessageId: uuid('context_summary_up_to_message_id'),
  contextSummaryVersion: integer('context_summary_version').default(0).notNull(),
});
```

说明：

| 字段 | 用途 |
| --- | --- |
| `contextSummary` | 当前会话滚动摘要 |
| `contextSummaryUpdatedAt` | 最近一次摘要更新时间 |
| `contextSummaryUpToMessageId` | 摘要已经覆盖到哪条消息 |
| `contextSummaryVersion` | 便于后续摘要 prompt 升级和迁移 |

### 4.2 新增 conversation_memories

长期记忆独立成表，不直接写入 notes。

```ts
export const conversationMemories = pgTable('conversation_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'set null' }),
  type: text('type', {
    enum: ['preference', 'goal', 'fact', 'decision', 'open_question', 'concept', 'correction']
  }).notNull(),
  content: text('content').notNull(),
  normalizedContent: text('normalized_content'),
  sourceMessageIds: uuid('source_message_ids').array(),
  importance: real('importance').default(0.5).notNull(),
  confidence: real('confidence').default(0.7).notNull(),
  status: text('status', { enum: ['active', 'archived', 'rejected'] }).default('active').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at'),
});
```

推荐索引：

```sql
CREATE INDEX idx_conversation_memories_user_status
  ON conversation_memories (user_id, status, updated_at DESC);

CREATE INDEX idx_conversation_memories_user_type
  ON conversation_memories (user_id, type);
```

### 4.3 复用 embeddings 表

长期记忆也需要语义检索。复用现有 `embeddings` 表：

```ts
sourceType = 'conversation_memory'
sourceId = conversationMemories.id
content = conversationMemories.content
metadata = {
  type,
  importance,
  confidence,
  sessionId
}
```

这样长期记忆可以走现有 pgvector 检索能力，也能被 RRF 融合。

---

## 5. 后端服务设计

### 5.1 context-assembly-service

新增文件：

```text
backend/src/services/context-assembly-service.ts
```

核心职责：统一组装每轮对话上下文。

```ts
export interface AssembleChatContextInput {
  userId: string;
  sessionId: string;
  query: string;
  model: string;
  attachmentTexts: string[];
  imageAttachments?: Array<{ fileType: string; base64: string }>;
  currentUserMessageId?: string;
}

export interface AssembledChatContext {
  systemPrompt: string;
  messages: ChatMessage[];
  budgets: ContextBudget;
  diagnostics: {
    profileIncluded: boolean;
    sessionSummaryIncluded: boolean;
    longTermMemoryCount: number;
    ragIncluded: boolean;
    recentMessageCount: number;
  };
}

export async function assembleChatContext(input: AssembleChatContextInput): Promise<AssembledChatContext>;
```

`chat-service.ts` 只负责处理发送、保存消息、调用 stream，不再直接拼 prompt。

### 5.2 session-memory-service

新增文件：

```text
backend/src/services/session-memory-service.ts
```

职责：维护当前会话滚动摘要。

```ts
export async function updateSessionRollingSummaryAfterTurn(
  userId: string,
  sessionId: string,
  options?: { force?: boolean }
): Promise<void>;

export async function getSessionSummary(
  userId: string,
  sessionId: string
): Promise<string | null>;
```

触发时机：

1. assistant 消息保存成功后触发。
2. 当未摘要消息数 >= 8 或估算 token >= 3000 时更新。
3. 人格切换时仍可强制更新，但改为复用这个服务。

摘要 prompt 输出结构：

```json
{
  "user_goal": "用户当前目标",
  "decisions": ["已达成的关键结论"],
  "open_questions": ["仍未解决的问题"],
  "important_context": ["后续回答必须知道的上下文"],
  "entities": ["已提及的重要实体/概念"],
  "last_state": "当前对话停在什么位置"
}
```

保存到 `context_summary` 时可转为可读文本，避免 prompt 里出现过多 JSON 噪音。

### 5.3 long-term-memory-service

新增文件：

```text
backend/src/services/long-term-memory-service.ts
```

职责：提取、写入、检索长期记忆。

```ts
export async function extractLongTermMemoriesAfterTurn(
  userId: string,
  sessionId: string,
  sourceMessageIds: string[]
): Promise<void>;

export async function retrieveRelevantMemories(
  userId: string,
  query: string,
  sessionSummary?: string | null,
  limit?: number
): Promise<ConversationMemory[]>;

export async function formatMemoriesForPrompt(
  memories: ConversationMemory[],
  budgetTokens: number
): Promise<string>;
```

长期记忆提取规则：

| 类型 | 示例 | 是否自动写入 |
| --- | --- | --- |
| `preference` | “以后解释尽量用公式推导” | 是 |
| `goal` | “我在准备线性代数考试” | 是 |
| `fact` | “这个项目使用 Fastify + Next.js” | 是，但需较高置信度 |
| `decision` | “RAG 先做 RRF，再做 rerank” | 是 |
| `open_question` | “后面要补会话记忆管理” | 是 |
| `concept` | “用户正在学习 SVD” | 是，可关联知识图谱 |
| `correction` | “不要再把 X 理解成 Y” | 是，优先级高 |

去重策略：

1. 同 userId + type 下对 `normalizedContent` 做近似去重。
2. embedding 相似度 > 0.92 时不新增，改为更新 `updatedAt`、`importance`、`confidence`。
3. 用户明确否定时，把旧记忆设为 `archived` 或 `rejected`。

### 5.4 context-budget-service

新增文件：

```text
backend/src/services/context-budget-service.ts
```

职责：根据模型上下文窗口分配 token。

```ts
export interface ContextBudget {
  total: number;
  reservedForOutput: number;
  systemPersona: number;
  profile: number;
  sessionSummary: number;
  longTermMemory: number;
  rag: number;
  recentMessages: number;
  attachments: number;
}
```

MVP 分配策略：

| 上下文窗口 | profile | session summary | long-term memory | RAG | recent messages |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8K | 400 | 800 | 700 | 1500 | 剩余 |
| 32K | 600 | 1500 | 1500 | 4000 | 剩余 |
| 128K | 800 | 3000 | 4000 | 12000 | 剩余 |

优先级：

1. 当前用户输入和附件不能丢。
2. System Persona 不能丢。
3. 最近 1-2 轮原文尽量保留。
4. session summary 优先于长期记忆。
5. 长期记忆优先于普通 RAG。
6. RAG 超预算时按 rerank 分数截断。

---

## 6. 每轮对话流程

```text
用户发送消息
  |
  v
保存 user message
  |
  v
assembleChatContext()
  |
  +--> 读取 persona
  +--> 读取 profile summary
  +--> 读取 session rolling summary
  +--> 检索 relevant long-term memories
  +--> 调用 retrieveContext() 获取知识库 RAG
  +--> 按 token budget 读取最近原文消息
  |
  v
streamChat()
  |
  v
保存 assistant message
  |
  +--> updateSessionStats()
  +--> updateSessionRollingSummaryAfterTurn()
  +--> extractLongTermMemoriesAfterTurn()
  |
  v
返回 done
```

后台记忆更新不要阻塞用户看到最终回答。MVP 可以先 await，稳定后改为异步 job。

---

## 7. Prompt 注入格式

建议 system prompt 里使用稳定分区，便于调试。

```text
{persona.systemPromptTemplate}

【用户认知画像】
{profileSummary}
只用于调整解释方式、节奏和复习建议，不要暴露原始画像字段。

【当前会话摘要】
{sessionSummary}

【相关长期记忆】
1. [preference, confidence=0.92] 用户偏好用严谨推导解释数学问题。
2. [goal, confidence=0.88] 用户正在实现 LiveKnowledge 的对话记忆系统。

【知识库检索结果】
{ragContext}

【回答要求】
- 优先遵守 System Persona。
- 涉及用户偏好和目标时，可使用长期记忆，但不要声称“我记得”除非用户询问。
- 知识性事实优先依据知识库检索结果；不足时明确说明。
- 如果最近原文消息与长期记忆冲突，以最近原文消息为准，并考虑更新长期记忆。
```

---

## 8. API 与前端管理

MVP 后端 API：

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/memories` | 查看长期记忆 |
| PATCH | `/api/memories/:id` | 编辑内容、类型、重要度 |
| DELETE | `/api/memories/:id` | 软删除，置为 `archived` |
| POST | `/api/memories/:id/reject` | 标记错误记忆 |
| POST | `/api/sessions/:id/summary/regenerate` | 强制重建会话摘要 |

前端最小入口：

1. 设置页增加“记忆管理”Tab。
2. 支持按类型筛选长期记忆。
3. 支持编辑、停用、删除。
4. 会话详情里展示当前 `context_summary`，支持重新生成。

---

## 9. 实施计划表

| 阶段 | 任务 | 涉及文件 | 产出 | 验收标准 |
| --- | --- | --- | --- | --- |
| P0 | 修复最近消息窗口 | `backend/src/services/chat-service.ts` | 最近消息按 `createdAt desc limit N` 获取，再 reverse | 长会话中 prompt 包含最近消息，而不是最早消息 |
| P0 | 抽出上下文组装服务 | 新增 `context-assembly-service.ts`，修改 `chat-service.ts` | System Persona、画像、摘要、RAG、最近消息统一组装 | `chat-service.ts` 不再散落 prompt 拼接逻辑 |
| P1 | 扩展 session 摘要字段 | `schema.ts` + migration | `context_summary_updated_at`、`context_summary_up_to_message_id`、`context_summary_version` | migration 可执行，旧数据不丢 |
| P1 | 实现滚动摘要服务 | 新增 `session-memory-service.ts`，改造 `session-service.ts` | 每轮对话后自动更新 `context_summary` | 超过阈值后旧消息被摘要，新消息仍原文保留 |
| P1 | 动态 recent messages 预算 | 新增 `context-budget-service.ts` | 按模型窗口选择最近原文消息数量 | 8K 模型不超上下文，32K/128K 自动保留更多历史 |
| P2 | 新增长期记忆表 | `schema.ts` + migration | `conversation_memories` 表和索引 | 能创建、查询、归档长期记忆 |
| P2 | 长期记忆提取服务 | 新增 `long-term-memory-service.ts` | 从最近一轮或多轮提取 preference/goal/fact/decision/open_question | 明确偏好和目标能自动进入 memory 表 |
| P2 | 长期记忆 embedding | 复用 `embedding.ts`、`embeddings` | `source_type='conversation_memory'` 的向量记录 | 当前问题能召回相关长期记忆 |
| P2 | 长期记忆检索注入 | `context-assembly-service.ts` | `【相关长期记忆】` 分区 | 同主题跨会话提问能注入相关偏好/目标 |
| P3 | 记忆管理 API | 新增 `routes/memories.ts`，注册到 `app.ts` | GET/PATCH/DELETE/reject API | 用户可以查看、编辑、停用记忆 |
| P3 | 前端记忆管理页 | `frontend/src/...` | 设置页或独立页面 | 用户可管理长期记忆和会话摘要 |
| P4 | 异步任务化 | 可选新增 job/queue | 摘要和记忆提取不阻塞对话 | 模型回答完成后立即 done，后台更新记忆 |
| P4 | 观测与调试 | 日志 + diagnostics | 每轮输出上下文组成统计 | 能定位 profile/memory/RAG 是否注入 |

---

## 10. 推荐执行顺序

### 批次 A：先让长对话不断片

1. 修复最近消息查询顺序。
2. 新增 `context-assembly-service.ts`。
3. 实现滚动会话摘要。
4. 把人格切换摘要逻辑改为复用滚动摘要服务。

完成后，即使没有长期记忆，长对话也能通过“最近原文 + 会话摘要”保持连续。

### 批次 B：加入真正长期记忆

1. 新增 `conversation_memories` 表。
2. 实现记忆提取 prompt。
3. 写入 embeddings。
4. 在上下文组装中检索并注入相关长期记忆。

完成后，跨会话偏好、目标、决策可以被召回。

### 批次 C：用户可控与产品化

1. 记忆管理 API。
2. 前端记忆管理页面。
3. 记忆冲突处理。
4. 异步 job 化和调试面板。

完成后，符合“本地优先、用户可控”的产品定位。

---

## 11. 关键实现细节

### 11.1 最近消息读取

不要继续固定“正序 limit 20”。推荐新增：

```ts
export async function listRecentMessagesForContext(
  sessionId: string,
  options: {
    excludeMessageId?: string;
    maxTokens: number;
    minTurns?: number;
  }
): Promise<ChatMessage[]>;
```

内部先取最近 40-80 条，再按 token budget 从后往前装入，最后 reverse。

### 11.2 摘要边界

滚动摘要只处理 `contextSummaryUpToMessageId` 之后、最近窗口之前的消息。

```text
已摘要区间：     [old messages covered by context_summary]
待摘要区间：     [messages after summary boundary and before recent window]
原文保留区间：   [latest messages kept in model context]
```

这样不会重复总结，也不会把刚发生的对话过早压缩掉。

### 11.3 长期记忆提取 prompt

只提取对未来有用的信息，不要把普通问答都存成记忆。

输出 JSON：

```json
{
  "memories": [
    {
      "type": "goal",
      "content": "用户正在为 LiveKnowledge 设计对话记忆系统。",
      "importance": 0.9,
      "confidence": 0.9,
      "reason": "用户明确要求直接实现该目标的设计方案。"
    }
  ]
}
```

过滤规则：

1. `importance < 0.5` 不写入。
2. `confidence < 0.65` 不写入，除非 type 是 `open_question`。
3. 不保存敏感信息，除非用户明确要求且本地可控。
4. 不保存模型自己推测出的用户属性。

### 11.4 冲突处理

如果新记忆与旧记忆冲突：

1. 最近明确表达优先。
2. 旧记忆标记为 `archived`，新记忆 `active`。
3. metadata 记录 `supersedesMemoryId`。

### 11.5 与 RAG 的边界

长期记忆回答“这个用户是谁、偏好什么、正在做什么、之前决定了什么”。

知识库 RAG 回答“资料里有什么知识、笔记、概念、关系”。

两者都可以 embedding 检索，但 prompt 分区必须分开，避免模型把用户偏好当成事实资料。

---

## 12. 测试计划

| 测试类型 | 场景 | 预期 |
| --- | --- | --- |
| 单元测试 | `listRecentMessagesForContext` 在 50 条消息中取上下文 | 返回最近消息，顺序仍为旧到新 |
| 单元测试 | token budget 很小时 | 至少保留最近一轮 user/assistant 和当前输入 |
| 单元测试 | 滚动摘要重复触发 | 不重复总结已覆盖消息 |
| 单元测试 | 长期记忆去重 | 相似偏好不新增重复记录 |
| 集成测试 | 长会话超过 30 轮 | prompt 包含 session summary + 最近消息 |
| 集成测试 | 用户说“以后回答短一点”后开启新会话 | 相关长期记忆被召回 |
| 集成测试 | 用户纠正“不是 A，是 B” | 旧记忆归档，新记忆生效 |
| E2E | 前端记忆管理删除一条记忆 | 后续对话不再注入该记忆 |

---

## 13. 完成标准

1. 多轮长会话不会只依赖固定 20 条消息。
2. 当前会话有自动滚动摘要，并且摘要能参与 query rewrite 和 system prompt。
3. 用户偏好、长期目标、关键决策可以跨会话召回。
4. 知识库 RAG 与长期记忆分区注入，不互相污染。
5. 用户可以查看和删除长期记忆。
6. 所有记忆数据保存在本地数据库。
7. 任意记忆服务失败时，对话主流程可降级继续。

---

## 14. 风险与取舍

| 风险 | 影响 | 处理方式 |
| --- | --- | --- |
| 每轮都摘要和提取记忆成本高 | 响应慢、费用高 | 阈值触发，后续改异步 job |
| LLM 提取错误记忆 | 用户体验差 | 置信度过滤 + 用户可删除 + 冲突归档 |
| 长期记忆过多 | prompt 膨胀 | embedding 检索 + importance 排序 + token budget |
| 隐私敏感 | 违背本地优先 | 默认本地存储，前端可见可删 |
| 摘要丢细节 | 长对话续接变差 | 最近原文窗口保留，摘要只覆盖较旧消息 |

---

## 15. MVP 最小闭环

如果只做最小可用版本，范围压缩为：

1. 修复最近消息查询。
2. 新增 `context-assembly-service.ts`。
3. 每 8 条消息滚动更新 `chat_sessions.context_summary`。
4. prompt 注入顺序改成：

```text
System Persona
+ 用户认知画像摘要
+ 当前会话滚动摘要
+ 知识库 RAG 检索结果
+ 最近 N 轮原文消息
+ 当前用户输入
```

长期记忆表和管理 UI 放到第二批次。

这个 MVP 已经能解决“长对话断片”和“只取最近固定消息”的核心问题。
