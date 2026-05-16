# LiveKnowledge — 活的本地知识库

## 项目概述

一个能与你对话、共同思考、并随时间自我进化的本地知识库。融合 AI 对话、知识提炼、间隔重复复习、知识图谱可视化、用户认知画像于一体，打造真正个性化的学习伴侣。

### 核心设计理念

- **本地优先**：所有用户数据存储在本地，隐私完全可控
- **学习闭环**：对话 → 提炼 → 复习 → 图谱 → 再对话，形成自增强的知识循环
- **认知画像驱动**：系统越用越懂用户，解释方式、复习节奏、推荐内容持续个性化

---

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | Next.js (App Router) | React 全栈框架，独立进程 |
| 后端 | Node.js / TypeScript + **Fastify** | 独立服务，REST API + SSE |
| 关系数据库 | PostgreSQL + pgvector | 关系数据 + 向量检索 |
| 图数据库 | Neo4j | 知识图谱存储与遍历 |
| 部署 | Docker Compose | 数据库服务容器化 |
| 图可视化 | D3.js | 力导向图交互 |
| 公式渲染 | KaTeX | LaTeX 数学公式 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端 (Next.js)                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ 对话界面 │ │ 笔记编辑 │ │ 复习界面 │ │ 知识图谱 │ │ 仪表盘   │  │
│  │ 导入向导 │ └─────────┘ └─────────┘ └─────────┘ └──────────┘  │
│  └────┬────┘                                                    │
│       │                    HTTP / SSE / WSS                     │
└───────┼─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      后端 (Node.js/TS)                           │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  API 路由层  │  │  流式处理     │  │    文件处理器         │   │
│  │             │  │  (SSE 转发)   │  │  (PDF/图片/URL/OCR)   │   │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      核心服务层                           │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐    │   │
│  │  │ 导师人格引擎 │ │ 知识提炼器  │ │    复习调度器       │    │   │
│  │  │(Prompt管理) │ │(手动Job+日志)│ │   (SSP-MMC)        │    │   │
│  │  └────────────┘ └────────────┘ └────────────────────┘    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐    │   │
│  │  │ 对话导入器  │ │ 认知画像引擎 │ │    RAG 检索器       │    │   │
│  │  │(格式解析)   │ │(规则+统计)  │ │(向量+全文+图谱)     │    │   │
│  │  └────────────┘ └────────────┘ └────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                      │
│  ┌───────────────────────┼───────────────────────┐              │
│  │                       │                       │              │
│  ▼                       ▼                       ▼              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐       │
│  │  PostgreSQL  │  │   pgvector   │  │      Neo4j      │       │
│  │  (关系数据)   │  │  (向量检索)   │  │    (图数据)      │       │
│  │              │  │              │  │                 │       │
│  │  • users     │  │              │  │  • 知识点节点     │       │
│  │  • sessions  │  │  • embeddings│  │  • 关系边        │       │
│  │  • messages  │  │  • metadata  │  │  • 路径遍历       │       │
│  │  • notes     │  │              │  │                 │       │
│  │  • cards     │  │              │  │                 │       │
│  │  • profiles  │  │              │  │                 │       │
│  └──────────────┘  └──────────────┘  └─────────────────┘       │
│                                                                  │
│  ┌─────────────┐              ┌─────────────────────────┐       │
│  │ AI Provider │              │       外部服务           │       │
│  │   代理层    │              │                         │       │
│  │             │              │  • URL 抓取              │       │
│  │ • OpenAI    │              │  • PDF 解析              │       │
│  │ • DeepSeek  │              │  • 网页渲染              │       │
│  │ • GLM       │              │  • OCR (可选)            │       │
│  │ • Kimi      │              │                         │       │
│  └─────────────┘              └─────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Docker Compose │
                    │                 │
                    │  PostgreSQL     │
                    │  Neo4j          │
                    └─────────────────┘
```

---

## 模块详细设计

### 1. AI 学习会话

#### 1.1 多导师人格系统

每种人格是一个可配置对象：

```typescript
interface Persona {
  id: string;
  name: string;                 // 显示名称，如 "算法导师"
  description: string;          // 一句话描述
  avatar?: string;              // 头像
  system_prompt_template: string; // 基础 system prompt 模板
  teaching_style: {
    approach: 'socratic' | 'direct' | 'scaffolded'; // 苏格拉底式/直接式/支架式
    explanation_depth: 'intuitive' | 'rigorous' | 'balanced';
    interaction_frequency: 'high' | 'medium' | 'low'; // 提问频率
  };
  knowledge_domains: string[];  // 擅长领域
  default_model: string;        // 默认使用的模型
  is_builtin: boolean;          // 内置 vs 用户自定义
  created_by: string;           // 用户ID
}
```

**人格切换**：会话级别切换，切换时携带当前上下文摘要。

#### 1.2 流式对话

- 前端通过 SSE 接收流式输出
- 支持 thinking/reasoning 内容的独立展示（DeepSeek/Claude 的思考链）
- 支持停止生成（abort controller）和重新生成

#### 1.3 多模型支持

统一 Provider 抽象：

```typescript
interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'deepseek' | 'zhipu' | 'moonshot';
  base_url: string;
  models: ModelConfig[];
}

interface ModelConfig {
  id: string;
  name: string;
  context_window: number;
  supports_vision: boolean;
  supports_streaming: boolean;
  supports_reasoning: boolean;
  max_output_tokens: number;
}
```

**模型切换**：消息级别可切换模型（但同一轮对话上下文需要适配不同模型的上下文长度）。

#### 1.4 上下文感知（RAG）

每次对话时，后端执行：
1. **Query Rewrite**：将用户问题改写为更适合检索的查询
2. **多路检索**：
   - 向量检索（pgvector）：语义相似度 TOP-K
   - 全文检索（PostgreSQL tsvector）：关键词匹配 TOP-K
   - 图谱增强（Neo4j）：基于向量检索结果查询关联节点，扩展候选池
3. **结果融合**：RRF (Reciprocal Rank Fusion) 融合多路结果
4. **上下文注入**：将检索到的相关笔记/知识点注入 system prompt

#### 1.5 多模态输入

| 输入类型 | 处理方式 |
|----------|----------|
| 文本 | 直接传入 |
| 图片 | base64 编码 → 传给支持 vision 的模型 |
| PDF | 后端解析（pdf-parse）提取文本 → 可全文送入或提炼后引用 |
| URL | 后端抓取（readability/cheerio）提取正文 → 提炼后引用 |

---

### 2. 知识提炼

#### 2.1 提炼流程

**手动触发**：用户在对话/笔记/导入内容旁点击"提炼"按钮。

```
用户触发提炼
    │
    ▼
┌──────────────┐
│ 创建 Job     │  status: pending
│ (记录输入快照)│  保存 content_hash，防篡改
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 预处理       │  清洗、去噪、格式标准化
│              │  记录处理日志
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 语义切分     │  结构感知递归切分
│ (Chunking)   │  保留层级关系
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│ 向量化       │────▶│ Embedding    │
│              │     │ 存入 pgvector│
└──────┬───────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│ 实体关系提取 │  LLM-based 提取概念和关系
│              │  记录提取日志
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│ 结构化输出   │────▶│ 笔记         │
│              │     │ 闪卡         │
│              │     │ 图谱节点/边  │
└──────┬───────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│ 用户预览     │  用户可编辑、选择采纳哪些
│ (前端界面)   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 用户采纳     │  正式入库
│              │  记录 user_feedback
└──────────────┘
```

#### 2.2 Chunking 策略

采用**结构感知递归切分**：

| 内容类型 | 切分策略 |
|----------|----------|
| Markdown | 按标题层级（H1→H2→H3）切分，保留层级关系 |
| 对话 | 按轮次切分，或按主题聚类后切分 |
| 纯文本 | 递归：段落 → 句子 → 固定长度，优先在语义边界切分 |
| 代码 | 按函数/类/逻辑块切分 |

Chunk 元数据保留：
- 来源文档 ID
- 在原文中的位置（起止索引）
- 层级路径（如 "1.2 线性代数/矩阵运算"）
- 前置 chunk 和后置 chunk 的引用

#### 2.3 实体关系提取

混合策略：
1. **规则层**：匹配已知概念词典（已有笔记标题、标签），快速标记已知实体
2. **LLM 层**：对未知内容调用 LLM 提取新实体和新关系
3. **冲突消解**：规则结果与 LLM 结果合并，优先级：用户确认 > 规则 > LLM

提取的关系类型：
- `IS_A`（是一种）
- `PART_OF`（是...的一部分）
- `PREREQUISITE_OF`（是...的前置知识）
- `RELATED_TO`（相关）
- `DERIVES_FROM`（推导自）
- `CONTRASTS_WITH`（与...对比）

#### 2.4 提炼 Job 数据模型

```typescript
interface ExtractionJob {
  id: string;
  user_id: string;
  source_type: 'conversation' | 'note' | 'document' | 'import';
  source_id: string;

  // 输入快照
  input_snapshot: {
    content_length: number;
    content_hash: string;
    preview: string;  // 前 500 字
  };

  // 配置
  config: {
    model: string;
    persona_id?: string;
    extract_types: ('notes' | 'cards' | 'concepts' | 'relations')[];
    chunking_strategy: string;
  };

  // 执行状态
  status: 'pending' | 'preprocessing' | 'chunking' | 'extracting' | 'completed' | 'failed';
  current_step: string;

  // 处理日志
  logs: Array<{
    step: string;        // 'preprocess' | 'chunk' | 'embed' | 'extract' | 'store'
    status: 'started' | 'completed' | 'failed';
    timestamp: Date;
    detail: object;      // 该步骤的详细数据
    duration_ms: number;
  }>;

  // 输出
  output?: {
    chunks: Chunk[];
    notes: Note[];
    cards: Card[];
    concepts: Concept[];
    relations: Relation[];
  };

  // 用户反馈
  user_feedback?: {
    accepted: boolean;
    accepted_notes: string[];    // 采纳的笔记 ID
    accepted_cards: string[];    // 采纳的卡片 ID
    modifications: object;
    accepted_at: Date;
  };

  created_at: Date;
  completed_at?: Date;
  error?: string;
}
```

---

### 3. MaiMemo 复习系统

#### 3.1 SSP-MMC 算法核心

采用 MaiMemo 开源的 SSP-MMC 算法（KDD 2022 & IEEE TKDE）：

- **半衰期模型**：基于记忆半衰期（half-life）预测遗忘，而非传统稳定性-可提取性模型
- **难度自适应**：每张卡片独立难度系数（1-18），根据用户历史表现动态调整
- **智能重新学习**：忘记后不简单重置，而是精细调整参数

#### 3.2 复习调度流程

```
用户完成复习
    │
    ▼
┌──────────────┐
│ 评分         │  1-4 分（Again/Hard/Good/Easy）
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ SSP-MMC 计算 │  更新记忆半衰期、难度系数
│              │  计算下次复习时间
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 更新卡片状态  │  记录复习历史
│              │  更新画像中的记忆参数
└──────────────┘
```

#### 3.3 卡片数据模型

```typescript
interface Card {
  id: string;
  user_id: string;
  note_id?: string;          // 关联的笔记

  // 内容
  front: string;              // 正面（问题/提示）
  back: string;               // 背面（答案）
  type: 'basic' | 'cloze' | 'image_occlusion'; // 基础/填空/图片遮挡
  tags: string[];

  // SSP-MMC 状态
  difficulty: number;         // 难度系数 1-18
  half_life: number;          // 当前记忆半衰期（天）
  retrievability: number;     // 当前可提取性 0-1
  last_reviewed_at?: Date;
  next_review_at: Date;
  review_count: number;
  lapse_count: number;        // 遗忘次数

  // 复习历史
  review_logs: Array<{
    date: Date;
    rating: 1 | 2 | 3 | 4;
    response_time_ms: number;
    half_life_before: number;
    half_life_after: number;
  }>;

  created_at: Date;
  updated_at: Date;
}
```

---

### 4. 知识图谱

#### 4.1 数据模型

Neo4j 中存储的节点和关系：

```cypher
// 节点类型
(:Concept {id, label, description, domain, embedding})
(:Note {id, title, summary, created_at})
(:Tag {id, name, color})
(:Card {id, front, status})

// 关系类型
(:Concept)-[:IS_A]->(:Concept)
(:Concept)-[:PART_OF]->(:Concept)
(:Concept)-[:PREREQUISITE_OF]->(:Concept)
(:Concept)-[:RELATED_TO {weight, source}]->(:Concept)
(:Note)-[:COVERS]->(:Concept)
(:Note)-[:REFERENCES]->(:Note)
(:Card)-[:TESTS]->(:Concept)
(:Tag)-[:LABELS]->(:Note|Concept)
```

#### 4.2 前端可视化

- D3.js 力导向图
- 节点按类型着色（概念/笔记/卡片/标签）
- 节点大小按连接数/重要度
- 点击节点：显示详情面板，可跳转到笔记/卡片编辑
- 支持筛选：按领域、按节点类型、按连接强度
- 缩放、拖拽、聚焦

#### 4.3 图谱与复习联动

复习卡片时，在侧边栏显示该卡片关联的知识点及其邻近节点，作为复习上下文。

---

### 5. 用户认知画像

#### 5.1 数据采集

| 数据源 | 采集指标 |
|--------|----------|
| 对话行为 | 提问主题分布、追问深度、反馈(👍👎)、消息长度、会话时长 |
| 复习行为 | 正确率、响应时间、重学次数、难度偏好、复习时段 |
| 浏览行为 | 点击节点、搜索关键词、页面停留、探索路径 |
| 时间模式 | 活跃时段、单次时长、连续天数、中断频率 |

#### 5.2 画像维度

```typescript
interface UserProfile {
  user_id: string;

  // 学习风格（-1 到 1）
  style_visual: number;        // 视觉型 ←→ 文本型
  style_intuitive: number;     // 直觉型 ←→ 形式型
  style_gradual: number;       // 渐进型 ←→ 跳跃型
  style_concise: number;       // 简洁型 ←→ 详实型

  // 认知参数
  attention_span: number;      // 平均专注时长（分钟）
  optimal_session_length: number;
  preferred_difficulty: number;

  // 记忆参数（从复习数据拟合）
  memory_stability_factor: number;
  memory_retrievability_threshold: number;

  // 置信度
  confidence: number;          // 画像置信度 0-1
  updated_at: Date;
}

interface DomainMastery {
  user_id: string;
  domain: string;
  mastery_level: number;       // 0-100
  cards_total: number;
  cards_mastered: number;
  avg_retrievability: number;
  last_studied: Date;
}

interface WeakPoint {
  user_id: string;
  concept_a: string;
  concept_b: string;
  confusion_count: number;
  last_confused: Date;
}
```

#### 5.3 画像如何影响系统

| 应用场景 | 影响方式 |
|----------|----------|
| AI 对话 | 将画像摘要注入 system prompt，调整解释风格和长度 |
| 复习调度 | 用个人记忆参数替代通用 SSP-MMC 参数 |
| 内容推荐 | 推荐"邻近但未知"的知识点 |
| 难度调整 | 根据认知负荷耐受度调整输出复杂度 |
| 学习路径 | 基于兴趣图谱和薄弱点生成个性化路线 |

---

### 6. 仪表盘

独立页面 `/dashboard`，三个 Tab：

#### 6.1 学习概览 Tab
- 今日/本周学习时长（柱状图）
- 复习完成率（环形进度）
- 连续学习 Streak（火焰 + 天数）
- 新掌握知识点趋势（折线图）

#### 6.2 知识健康 Tab
- 总笔记/卡片/节点数（大数字卡片）
- 知识领域分布（饼图/树图）
- 孤立知识点数量（带一键修复）
- 记忆保持率曲线
- 待复习卡片分布（按记忆强度分层）

#### 6.3 认知画像 Tab
- 学习风格雷达图（五维）
- 领域熟练度热力图
- 兴趣分布气泡图
- 薄弱点地图（网络图标红）
- 个人记忆参数展示

---

### 7. 对话导入

#### 7.1 支持格式

| 格式 | 说明 |
|------|------|
| ChatGPT 官方导出 | JSON 格式，完整保留会话结构 |
| ChatGPT 分享链接 | 抓取分享页面内容 |
| Markdown | 自定义分隔符解析对话 |
| 纯文本 | 自定义角色标记（如"用户：""助手："）|
| JSONL | 每行一个消息对象 |

#### 7.2 导入流程

```
选择文件/粘贴内容
    │
    ▼
┌──────────────┐
│ 格式自动检测  │  根据文件扩展名和内容特征判断格式
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 预览解析结果  │  显示解析出的会话列表，用户确认
│              │  检测重复（与已有会话对比）
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 选择导入模式  │
│              │  A) 仅导入会话（保留原始对话）
│              │  B) 导入并提炼（同时生成笔记/卡片）
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 执行导入     │  批量创建会话和消息记录
└──────────────┘
```

---

## 数据模型总览

### PostgreSQL 核心表

```sql
-- 用户
users (id, username, password_hash, created_at, updated_at)

-- AI Provider 配置（用户级别）
ai_provider_configs (id, user_id, provider_type, api_key_encrypted, base_url, is_active)

-- 导师人格
personas (id, user_id, name, description, system_prompt_template, teaching_style, ...)

-- 会话
sessions (id, user_id, persona_id, model_id, title, created_at, updated_at)

-- 消息
messages (id, session_id, role, content, model_id, tokens_used, created_at)

-- 笔记
notes (id, user_id, title, content, tags, source_type, source_id, created_at, updated_at)

-- 闪卡
cards (id, user_id, note_id, front, back, type, tags, difficulty, half_life, ...)

-- 复习记录
card_reviews (id, card_id, user_id, rating, response_time_ms, half_life_before, half_life_after, reviewed_at)

-- 用户画像
user_profiles (user_id, style_visual, style_intuitive, style_gradual, style_concise, ...)
domain_mastery (id, user_id, domain, mastery_level, ...)
weak_points (id, user_id, concept_a, concept_b, ...)

-- 提炼 Job
extraction_jobs (id, user_id, source_type, source_id, status, config, logs, output, ...)

-- 导入任务
import_tasks (id, user_id, format, status, preview, duplicate_check, ...)
```

### pgvector 向量表

```sql
-- 文档 Chunk 的向量表示
embeddings (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  source_type TEXT,          -- 'note' | 'conversation' | 'document'
  source_id UUID,
  chunk_index INT,
  content TEXT,              -- chunk 原文
  metadata JSONB,            -- 层级路径、起止位置等
  embedding VECTOR(1536),    -- 向量维度根据模型调整
  created_at TIMESTAMP
);

-- HNSW 索引用于 ANN 搜索
CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);
```

### Neo4j 图模型

见上文"知识图谱"部分。

---

## 关键流程

### 对话流程

```
用户输入
    │
    ▼
后端接收
    │
    ├──▶ Query Rewrite（改写为检索查询）
    │
    ├──▶ RAG 检索（向量 + 全文 + 图谱）
    │
    ├──▶ 加载用户画像
    │
    ├──▶ 组装 System Prompt（人格 + 画像 + 检索上下文）
    │
    └──▶ 调用 AI Provider（流式）
              │
              ▼
         流式返回前端
              │
              ▼
         保存消息到数据库
```

### 提炼流程

见上文"知识提炼"部分。

### 复习流程

```
用户打开复习界面
    │
    ▼
后端查询到期的卡片（next_review_at <= now）
    │
    ▼
按 SSP-MMC 优先级排序
    │
    ▼
展示卡片（正面）
    │
    ▼
用户回忆，点击翻面
    │
    ▼
用户自评（Again/Hard/Good/Easy）
    │
    ▼
SSP-MMC 计算新参数
    │
    ▼
更新卡片状态
    │
    ▼
更新用户画像（记忆参数）
    │
    ▼
展示下一张
```

---

## RAG Pipeline 详细策略

### 完整 Pipeline 流程

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. 数据预处理                                                │
│    • 去除系统提示标记、格式化噪音                             │
│    • 共指消解（解析"这个""它"的指代，依赖对话历史）            │
│    • 意图识别（问答/总结/对比/计算）                          │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Query Rewrite                                             │
│    • LLM Rewrite（默认）：改写成检索友好查询                   │
│    • HyDE（可选）：生成假设答案再 embedding                    │
│    • 子查询分解（多条件问题）                                  │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 多路检索（并行执行）                                       │
│    ├── 向量检索（pgvector HNSW，余弦相似度，TOP-10）          │
│    ├── 全文检索（PostgreSQL ts_rank，TOP-10）                 │
│    └── 图谱增强（基于向量结果查询 Neo4j 关联节点）            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. 结果融合（RRF）                                           │
│    • Reciprocal Rank Fusion: score = Σ(1 / (60 + rank))      │
│    • 融合后取 TOP-20                                          │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. 重排序（MVP 包含）                                        │
│    • 轻量 LLM-based 重排序（判断相关性分数）                  │
│    • 对 TOP-20 精排，取 TOP-5 作为最终上下文                  │
│    • 成本：20 次轻量模型调用/请求，可控                       │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. 上下文组装                                                │
│    • 去重（同一来源只保留最相关 chunk）                       │
│    • 按相关性排序                                            │
│    • 截断至模型上下文预算                                     │
└─────────────────────────────────────────────────────────────┘
```

### Query Rewrite 详细设计

**LLM Rewrite（默认策略）**

Prompt 模板：
```
你是一个查询优化助手。请将用户的输入改写为更适合知识库检索的查询。

规则：
1. 去除口语化表达和寒暄
2. 补全省略的上下文指代（基于当前会话主题）
3. 提取核心概念和关键词
4. 如果问题涉及多个概念，拆分为子查询
5. 保留原始问题的核心意图

当前会话主题：{session_topic}
对话历史摘要：{conversation_summary}

用户输入："{query}"

输出 JSON：
{
  "rewritten_query": "优化后的查询",
  "keywords": ["核心概念1", "核心概念2"],
  "sub_queries": ["子查询1", "子查询2"],
  "intent": "问答|总结|对比|计算"
}
```

使用模型：轻量模型（GPT-4o-mini / GLM-4-Flash），控制成本和延迟。

**HyDE（Hypothetical Document Embeddings）**

适用场景：用户问题很简短、模糊，或意图不明确。

流程：
1. 让 LLM 生成假设的"理想答案"（100-200 字）
2. 对假设答案做 embedding
3. 用假设答案的向量去检索相似文档
4. 原始查询同时用于全文检索

Prompt 模板：
```
请基于你的知识，写一个简短的回答来回应以下问题（100字左右）。
这个回答将用于帮助检索相关知识，不需要完全准确。

问题：{query}
```

**共指消解**

维护对话状态，维护当前会话的"已提及实体列表"：

```typescript
interface ConversationState {
  mentioned_entities: Array<{
    mention: string;      // "这个定理"
    resolved: string;     // "费马大定理"
    message_id: string;   // 首次提及的消息
  }>;
  current_topic: string;   // 当前讨论主题
  context_summary: string; // 对话摘要（每 N 轮更新一次）
}
```

当检测到"这个""它""那个"等代词时，用 LLM 或规则解析指代对象。

### 检索详细设计

**向量检索**

```sql
-- HNSW 索引（构建时）
CREATE INDEX idx_embeddings_hnsw ON embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 查询时设置 ef_search
SET hnsw.ef_search = 100;

-- 检索查询
SELECT e.id, e.content, e.metadata,
       1 - (e.embedding <=> $query_embedding) AS similarity
FROM embeddings e
WHERE e.user_id = $user_id
  AND ($filter_tag IS NULL OR $filter_tag = ANY(e.metadata->'tags'))
ORDER BY e.embedding <=> $query_embedding
LIMIT 10;
```

参数：
- `m = 16`：每个节点的最大连接数
- `ef_construction = 64`：构建时的搜索范围
- `ef_search = 100`：查询时的搜索范围（越大越准越慢）

**全文检索**

PostgreSQL 内置全文检索需要中文分词支持。方案：

方案 A：pg_jieba（结巴分词扩展）
```sql
-- 创建中文全文检索配置
CREATE TEXT SEARCH CONFIGURATION chinese (COPY = pg_catalog.simple);
CREATE TEXT SEARCH DICTIONARY jieba (TEMPLATE = simple);

-- 为笔记内容创建全文检索向量
ALTER TABLE notes ADD COLUMN search_vector tsvector;
CREATE INDEX idx_notes_search ON notes USING GIN(search_vector);

-- 更新向量（触发器自动维护）
UPDATE notes SET search_vector =
  setweight(to_tsvector('chinese', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('chinese', coalesce(content, '')), 'B');
```

方案 B：如果 pg_jieba 安装复杂，可先使用简单方案——按字切分 + 前缀匹配。

**权重策略**：标题权重 A > 正文权重 B > 标签权重 C。

**图谱检索**

```cypher
// 从当前主题概念出发，查询两跳邻居
MATCH (c:Concept)
WHERE c.label CONTAINS $topic
MATCH (c)-[r:RELATED_TO|PREREQUISITE_OF|IS_A|PART_OF]-(related)
WITH c, related, r
  ORDER BY r.weight DESC
RETURN c.label as source,
       related.label as target,
       type(r) as relation,
       r.weight as weight
LIMIT 10
```

图谱检索的触发条件：当对话涉及已存在于图谱中的概念时激活。

**混合融合（RRF）**

```typescript
function reciprocalRankFusion(
  vectorResults: RetrievalResult[],
  fullTextResults: RetrievalResult[],
  graphResults: RetrievalResult[],
  k: number = 60
): FusionResult[] {
  const scores = new Map<string, number>();
  const docs = new Map<string, RetrievalResult>();

  // 收集所有文档
  [...vectorResults, ...fullTextResults, ...graphResults]
    .forEach(r => docs.set(r.id, r));

  // RRF 计分
  [vectorResults, fullTextResults, graphResults].forEach(results => {
    results.forEach((r, rank) => {
      const current = scores.get(r.id) || 0;
      scores.set(r.id, current + 1 / (k + rank + 1));
    });
  });

  // 按分数排序
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id, score]) => ({ ...docs.get(id)!, rrf_score: score }));
}
```

**重排序（MVP 包含）**

第二阶段使用轻量 LLM 对 RRF 融合后的 TOP-20 做精排：

Prompt 模板：
```
请判断以下文档片段是否能帮助回答用户问题。

用户问题：{query}
文档片段：{chunk_content}

请输出一个 0-10 的相关性分数：
- 10：文档直接回答了问题
- 5：文档部分相关，有参考价值
- 0：文档完全不相关

只输出数字，不要解释。
```

- 模型：GPT-4o-mini / GLM-4-Flash（轻量、低成本）
- 成本：20 次调用 ≈ 每次 ¥0.001-0.003，单请求总成本 ¥0.02-0.06
- 输出：按分数排序，取 TOP-5 作为最终上下文
- 并发：20 个请求并行发送，减少延迟

**替代方案（后续优化）**：本地轻量 cross-encoder 模型（如 ms-marco-MiniLM），零 API 成本但需要本地推理资源。

### 切分策略详细设计

**Markdown 文档**

```typescript
function splitMarkdown(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const sections = parseMarkdownSections(content); // 按 H1/H2/H3 切分

  for (const section of sections) {
    if (section.length < MAX_CHUNK_SIZE) {
      chunks.push({
        content: section.content,
        metadata: {
          heading_path: section.headingPath, // ["1. 线性代数", "1.2 矩阵运算"]
          level: section.level,
          type: 'markdown_section'
        }
      });
    } else {
      // 大段落递归按句子切分
      const subChunks = recursiveSplit(section.content, MAX_CHUNK_SIZE);
      subChunks.forEach((sc, i) => chunks.push({
        content: sc,
        metadata: {
          heading_path: section.headingPath,
          chunk_index: i,
          total_chunks: subChunks.length,
          type: 'markdown_paragraph'
        }
      }));
    }
  }

  return chunks;
}
```

**对话记录**

按主题聚类后切分：
1. 计算相邻消息的语义相似度（embedding 余弦相似度）
2. 相似度低于阈值时切分（主题转换点）
3. 每个 chunk 包含完整对话上下文（用户+AI 轮次）

**通用文本**

递归切分优先级：
1. 段落边界（\n\n）
2. 句子边界（句号/问号/感叹号）
3. 固定长度（MAX_CHUNK_SIZE，默认 500 tokens）

### 向量化策略

**Embedding 模型选择**

| 模型 | 维度 | 中文效果 | 调用方式 | 成本 | 隐私 |
|------|------|----------|----------|------|------|
| 阿里百炼 text-embedding-v4 | 1536 | 优秀 | API | 低 | 国内直连 |
| 智谱 embedding-2 | 1024 | 优秀 | API | 低 | 国内直连 |
| 智谱 embedding-3 | 2048 | 极优 | API | 低 | 国内直连 |
| OpenAI text-embedding-3-small | 1536 | 良好 | API | 低 | 需代理 |
| BGE-M3 | 1024 | 良好 | 本地 | 零 | 本地 |
| GTE-base | 768 | 良好 | 本地 | 零 | 本地 |

**已确定**：阿里百炼 text-embedding-v4（维度 1536，中文效果优秀，国内直连稳定）。

**向量维度配置**：
```typescript
// 根据所选模型动态配置
const EMBEDDING_CONFIG = {
  'bailian-text-embedding-v4': { dimension: 1536 },  // 默认
  'zhipu-embedding-2': { dimension: 1024 },
  'zhipu-embedding-3': { dimension: 2048 },
  'openai-3-small': { dimension: 1536 },
  'openai-3-large': { dimension: 3072 },
  'bge-m3': { dimension: 1024 },
};
```

**批量向量化**：
- 提炼 Job 中，所有 chunk 批量调用 embedding API（减少网络开销）
- 批大小：根据 API 限制，通常 100-500 条/批

### 实体关系提取详细设计

**混合提取流程**

```
输入文本
    │
    ▼
┌──────────────┐
│ 规则层        │  快速匹配已知概念词典
│              │  （已有笔记标题、已有概念标签）
└──────┬───────┘
       │
       ├──▶ 已知实体列表 A
       │
       ▼
┌──────────────┐
│ LLM 层        │  提取未知的新实体和新关系
│              │  （结构化输出）
└──────┬───────┘
       │
       ├──▶ 新实体列表 B + 关系列表 C
       │
       ▼
┌──────────────┐
│ 冲突消解      │  A ∪ B，去重，优先级：
│              │  用户确认 > 规则匹配 > LLM 提取
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 输出          │  实体列表 + 关系列表
└──────────────┘
```

**LLM 提取 Prompt**

```
请从以下文本中提取知识实体和它们之间的关系。

已知概念（优先匹配，如果文本中涉及则直接使用）：
{known_concepts}

文本：
{text}

输出 JSON：
{
  "entities": [
    {
      "name": "实体名称",
      "type": "Concept|Person|Term|Formula",
      "description": "一句话描述",
      "is_new": true|false
    }
  ],
  "relations": [
    {
      "source": "实体A",
      "target": "实体B",
      "type": "IS_A|PART_OF|PREREQUISITE_OF|RELATED_TO|DERIVES_FROM|CONTRASTS_WITH",
      "description": "关系描述"
    }
  ]
}
```

### 入库策略

**跨库一致性**

数据需要同时写入 PostgreSQL（笔记、向量）和 Neo4j（图谱），采用**最终一致性**策略：

```typescript
async function storeExtractionResult(result: ExtractionOutput) {
  // 1. 写入 PostgreSQL（主存储）
  const pgTransaction = await db.beginTransaction();
  try {
    const noteIds = await pgTransaction.insertNotes(result.notes);
    const cardIds = await pgTransaction.insertCards(result.cards);
    await pgTransaction.insertEmbeddings(result.chunks);
    await pgTransaction.commit();
  } catch (e) {
    await pgTransaction.rollback();
    throw e;
  }

  // 2. 异步写入 Neo4j（图谱）
  // 失败时记录到补偿队列，后台重试
  await graphQueue.add('sync_to_neo4j', {
    concepts: result.concepts,
    relations: result.relations,
    note_ids: noteIds,
  });
}
```

**补偿队列**：
- 使用 PostgreSQL 表作为简单队列（避免引入 Redis）
- 后台定时任务消费队列，重试失败的 Neo4j 写入
- 最大重试 3 次，失败后人工介入

### RAG Pipeline 关键决策

| 决策项 | 选择 | 说明 |
|--------|------|------|
| **上下文预算分配** | **动态调整** | 检索上下文至少保证 1500 tokens，根据历史消息长度和模型 context window 自适应分配 |
| **检索空结果** | **诚实告知** | 知识库无相关内容时，明确提示用户，再基于通用知识回答 |
| **图谱检索模式** | **向量增强** | 不作为独立检索路，而是基于向量检索结果查询 Neo4j 关联节点，扩展候选池 |
| **实时性** | **最终一致性** | 新笔记 embedding 异步生成，接受短暂延迟；会话内新内容通过临时上下文补偿 |
| **相关性阈值** | **自适应阈值** | 最高相关性 < 0.5 时判定为空结果；否则取 TOP-5，低相关性结果自然被重排序淘汰 |
| **检索缓存与去重** | **会话级缓存** | 同一会话内缓存检索结果；多轮对话中对重复 chunk 按来源去重，只保留最相关的一条 |

#### 上下文预算动态分配算法

```typescript
function allocateContextBudget(
  modelConfig: ModelConfig,
  systemPromptTokens: number,
  historyMessagesTokens: number,
  userInputTokens: number
): { retrievalBudget: number; historyBudget: number } {
  const totalBudget = modelConfig.context_window * 0.9; // 留 10% 缓冲
  const reserved = systemPromptTokens + userInputTokens + 500; // system + input + 响应预留

  const available = totalBudget - reserved;

  // 保证检索上下文至少 1500 tokens
  const retrievalBudget = Math.max(1500, available * 0.35);
  const historyBudget = available - retrievalBudget;

  // 如果历史消息超出预算，截断历史（保留最近的）
  if (historyMessagesTokens > historyBudget) {
    return { retrievalBudget, historyBudget }; // 历史在组装时截断
  }

  // 如果历史消息很少，剩余预算分配给检索
  const remaining = historyBudget - historyMessagesTokens;
  return {
    retrievalBudget: retrievalBudget + remaining * 0.5, // 一半给检索，一半留作响应缓冲
    historyBudget,
  };
}
```

#### 图谱检索：向量增强模式

参考 LightRAG / nano-GraphRAG 的最佳实践，图谱检索不作为独立的"第三路"，而是向量检索的增强：

```
向量检索 TOP-10
    │
    ├──▶ 得到相关笔记/概念
    │
    ▼
Neo4j 关联查询：对这些笔记/概念的 1-2 跳邻居
    │
    ├──▶ 得到关联节点对应的笔记/chunk
    │
    ▼
合并到向量候选池（去重）
    │
    ▼
与全文检索结果一起做 RRF 融合
```

**优势**：
- 避免独立图谱检索路"喧宾夺主"
- 只在向量检索有效时才激活图谱扩展（节省 Neo4j 查询）
- 关联节点内容天然与向量结果语义相关，质量更高

#### 会话级检索缓存

```typescript
interface SessionRetrievalCache {
  sessionId: string;
  // 缓存最近 N 轮的检索结果
  recentResults: Array<{
    query: string;
    chunks: Chunk[];
    timestamp: Date;
  }>;
  // 已注入上下文的 chunk ID 集合（去重用）
  injectedChunkIds: Set<string>;
}

// 去重逻辑：如果新检索结果中的 chunk 与已注入的来源相同，只保留相似度更高的
function deduplicateChunks(newChunks: Chunk[], injectedIds: Set<string>): Chunk[] {
  const sourceMap = new Map<string, Chunk>(); // source_id -> best chunk

  for (const chunk of newChunks) {
    if (injectedIds.has(chunk.id)) continue;
    const existing = sourceMap.get(chunk.source_id);
    if (!existing || chunk.similarity > existing.similarity) {
      sourceMap.set(chunk.source_id, chunk);
    }
  }

  return Array.from(sourceMap.values());
}
```

### 检索参数调优建议

| 参数 | 默认值 | 调优方向 |
|------|--------|----------|
| 向量 TOP-K | 10 | 数据量大时增加到 20 |
| 全文 TOP-K | 10 | 与向量保持一致 |
| 图谱邻居深度 | 2 跳 | 需要更深关联时增加到 3 |
| RRF k | 60 | 标准值，通常不需调整 |
| HNSW ef_search | 100 | 精度要求高时增加到 200 |
| Chunk 大小 | 500 tokens | 技术文档可调大到 1000 |
| Chunk 重叠 | 50 tokens | 保证上下文连续性 |

---

## 部署架构

### 开发环境

```bash
# 1. 启动数据库
docker compose up -d

# 2. 启动后端
cd backend && npm run dev

# 3. 启动前端
cd frontend && npm run dev
```

### Docker Compose 配置

```yaml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: liveknowledge
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: liveknowledge
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  neo4j:
    image: neo4j:5-community
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["apoc", "gds"]'
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    ports:
      - "7474:7474"
      - "7687:7687"

volumes:
  postgres_data:
  neo4j_data:
  neo4j_logs:
```

---

## 实现路径（推荐方案 A）

| 阶段 | 目标 | 核心功能 |
|------|------|----------|
| **MVP** | 能对话、能存笔记 | AI 对话（多人格+多模型+流式）、会话存储、基础笔记、用户系统 |
| **v0.2** | 知识能沉淀 | 知识提炼（手动Job+日志）、对话导入、结构化笔记 |
| **v0.3** | 知识能巩固 | 闪卡生成、MaiMemo 复习系统 |
| **v0.4** | 知识能连接 | 知识图谱（D3.js + Neo4j）、仪表盘 |
| **v0.5** | 系统能进化 | 用户认知画像、个性化对话、学习路径 |

---

## 已确认技术选型

| 选型 | 确定方案 |
|------|----------|
| 后端框架 | **Fastify** |
| Embedding 模型 | **阿里百炼 text-embedding-v4** |
| 前端状态管理 | **Zustand** |

## 待决策事项（实现阶段确定）

1. **文件存储**：本地文件系统 / 对象存储（MinIO）
2. **认证方式**：JWT / Session（本地应用，推荐 Session）
