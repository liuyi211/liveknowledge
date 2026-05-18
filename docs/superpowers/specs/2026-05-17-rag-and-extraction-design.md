# RAG 补全 + 知识提炼 设计文档

## 背景

当前项目已有：
- 完整的对话系统（流式 SSE、多模型、多人格）
- 笔记系统（CRUD、文件夹、Markdown 编辑器）
- 基础的 RAG 骨架（Query Rewrite + 上下文注入）
- `embeddings` 表结构（vector(1536)）但无数据
- `neo4j-driver` 已安装但未使用

缺失：
- 文档切分 + 向量化 + 真正的向量检索
- 实体/关系提取 + 知识图谱
- 知识提炼（从对话/笔记生成结构化知识产物）

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 架构模式 | **统一式** | 实体/关系提取逻辑被 RAG 和知识提炼共享，只是触发时机不同 |
| RAG 索引触发 | **手动按钮** | 用户希望完全控制，避免每次编辑笔记都触发处理 |
| 实体关系提取 | **纯 LLM** | 当前最佳实践，准确率高，无需维护词典 |
| 图谱检索 | **完整 GraphRAG** | 包含社区发现 + 社区摘要 + Local/Global 两种查询模式 |
| 重排序 | **LLM pointwise** | 复用已有 Provider 代理层，实现简单 |
| 重排序配置 | **独立配置项** | 用户可自主选择轻量模型，控制成本 |
| 分阶段实施 | **3 阶段** | 每阶段有独立交付价值，可逐步验证 |

## 阶段 1：RAG 基础设施

### 目标
让对话能真正从笔记中检索到相关内容。

### 手动索引按钮

- 笔记编辑器右上角增加"建立索引"按钮
- 已索引笔记显示"已索引"标签 + 最后索引时间
- 笔记列表右键菜单也提供"建立索引"
- 索引过程异步，前端轮询状态

新增 API：
- `POST /api/notes/:id/index` — 触发索引
- `GET /api/notes/:id/index-status` — 查询状态

### 文档切分

| 内容类型 | 切分策略 |
|----------|----------|
| Markdown | 按 H1/H2/H3 标题层级切分，大段落递归细分 |
| 纯文本 | 递归：段落边界 → 句子边界 → 固定长度 |

- Chunk 大小：~500 字（中文）
- 重叠：50 字
- 元数据：来源笔记 ID、起止位置、标题路径

### 向量化

- 模型：阿里百炼 text-embedding-v4（1536 维）
- 调用：复用 AI Provider 代理层
- 批量：100 条 / 批

### 检索通路（4 路并行）

```
Query Rewrite
    │
    ▼
并行执行 4 路检索
    ├── 路 1: 向量检索（语义相似）
    │   └── pgvector cosine similarity
    ├── 路 2: 全文检索（关键词匹配）
    │   └── PostgreSQL tsvector
    ├── 路 3: Local Search（实体邻居+关系路径）
    │   └── Neo4j 图谱遍历
    └── 路 4: Global Search（社区摘要）
        └── Neo4j Community 节点匹配
    │
    ▼
RRF 融合
    │
    ▼
轻量 LLM 重排序（逐条打分）
    │
    ▼
取 TOP-N 作为最终上下文注入
```

**各路检索详细设计：**

**路 1 — 向量检索**：
```sql
SELECT id, content, metadata,
       1 - (embedding <=> query_vector) AS similarity
FROM embeddings
WHERE user_id = $user_id AND source_type = 'note'
ORDER BY embedding <=> $query_vector
LIMIT $vector_top_k;
```

**路 2 — 全文检索**：
- PostgreSQL `tsvector` + `simple` 配置（中文按字切分）
- 权重：标题 A > 正文 B

**路 3 — Local Search**：
1. 从查询中提取实体（调用 LLM）
2. 查 Neo4j：这些实体的 1-2 跳邻居
3. 获取邻居对应的 chunk
4. 组装关系路径文本

**路 4 — Global Search**：
1. 查询 embedding 与 Community.embedding 相似度比较
2. 找到最相关的社区
3. 获取社区内的 Concept + 对应 chunk

**RRF 融合**：
```typescript
score = Σ(1 / (k + rank))
```

**重排序**：
- 对 RRF 后的候选文档，逐条调用轻量 LLM 判断相关性（0-10 分）
- 按分数重新排序，取 TOP-N 注入上下文

### 上下文注入

组装后的上下文结构：

```
以下是从知识库中检索到的相关内容：

[来自知识图谱的关系路径]
矩阵与向量通过以下路径关联：
- 矩阵 → 相关 → 向量空间
- 矩阵乘法 → 推导自 → 向量内积

[来自社区摘要]
你关于"线性代数运算"的知识社区包含矩阵乘法、行列式、特征值等概念...

[来自笔记片段]
[1] 来自《线性代数基础》：矩阵可以看作向量的线性组合...
[2] 来自《矩阵分解》：LU分解是将矩阵分解为...
```

### 可配置参数（暴露到前端）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `vector_top_k` | 10 | 向量检索返回的候选数量 |
| `full_text_top_k` | 10 | 全文检索返回的候选数量 |
| `local_search_top_k` | 10 | 图谱局部搜索返回的候选数量 |
| `global_search_top_k` | 5 | 图谱全局搜索返回的社区数量 |
| `rrf_k` | 60 | RRF 平滑常数，越大则低排名文档越不被惩罚。推荐值 60（论文标准值） |
| `rrf_top_n` | 10 | RRF 融合后进入重排序的候选数量 |
| `rerank_enabled` | true | 是否启用重排序 |
| `rerank_model` | — | 重排序使用的模型，建议选择轻量低成本模型 |
| `rerank_top_n` | 5 | 重排序后最终注入上下文的文档数量 |
| `context_budget_tokens` | 1500 | 检索上下文占用的 token 上限 |

### 数据模型变更

**`notes` 表新增字段**：
```sql
index_status TEXT CHECK (index_status IN ('idle','chunking','embedding','storing','done','failed')),
index_logs JSONB DEFAULT '[]',
index_error TEXT,
indexed_at TIMESTAMP
```

**新建 `user_retrieval_settings` 表**：
```sql
CREATE TABLE user_retrieval_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  vector_top_k INTEGER DEFAULT 10,
  full_text_top_k INTEGER DEFAULT 10,
  local_search_top_k INTEGER DEFAULT 10,
  global_search_top_k INTEGER DEFAULT 5,
  rrf_k INTEGER DEFAULT 60,
  rrf_top_n INTEGER DEFAULT 10,
  rerank_enabled BOOLEAN DEFAULT true,
  rerank_provider_config_id UUID REFERENCES ai_provider_configs(id),
  rerank_model TEXT,
  rerank_top_n INTEGER DEFAULT 5,
  context_budget_tokens INTEGER DEFAULT 1500,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

索引重建时先删除该笔记的所有旧 embedding，再插入新的。

### 日志结构

```typescript
interface IndexLog {
  step: 'chunk' | 'embed' | 'store';
  status: 'started' | 'completed' | 'failed';
  timestamp: Date;
  detail: {
    chunk_count?: number;
    total_chars?: number;
    embedded_count?: number;
    deleted_old?: number;
  };
  duration_ms: number;
}
```

前端显示处理步骤 + 可展开详细日志面板。

## 阶段 2：完整 GraphRAG

### 目标
建立知识图谱，支持 Local Search（实体邻居）和 Global Search（社区摘要）两种检索模式。

### Neo4j 数据模型

```cypher
(:Concept {id, label, description, embedding})
(:Note {id, title})
(:Community {id, summary, level, rank, embedding})

(:Concept)-[:IS_A]->(:Concept)
(:Concept)-[:PART_OF]->(:Concept)
(:Concept)-[:PREREQUISITE_OF]->(:Concept)
(:Concept)-[:RELATED_TO {weight}]->(:Concept)
(:Note)-[:COVERS]->(:Concept)
(:Concept)-[:BELONGS_TO]->(:Community)
```

### 共享提取逻辑

```typescript
function extractEntitiesAndRelations(text: string): {
  entities: Array<{
    name: string;
    type: 'Concept' | 'Person' | 'Term' | 'Formula';
    description: string;
  }>;
  relations: Array<{
    source: string;
    target: string;
    type: 'IS_A' | 'PART_OF' | 'PREREQUISITE_OF' | 'RELATED_TO' | 'DERIVES_FROM' | 'CONTRASTS_WITH';
    description: string;
  }>;
}
```

- 复用用户配置的 chat 模型
- Prompt + few-shot，要求输出 JSON

### 构建阶段

```
笔记索引完成
    │
    ▼
Step 1: 实体/关系提取（LLM）→ 写入 Neo4j
    │
    ▼
Step 2: 触发社区发现（异步，每次索引后自动执行）
    │
    ├── 使用 Neo4j GDS Louvain 算法
    ├── 输入：Concept 节点 + 关系
    └── 输出：每个 Concept 分配 Community ID
    │
    ▼
Step 3: 社区摘要生成
    │
    ├── 对每个 Community，获取其中所有 Concept
    ├── 调用 LLM 生成摘要（100-200 字）
    └── 摘要示例："这个社区包含矩阵乘法、行列式、特征值等概念，核心主题是线性代数中的矩阵运算..."
    │
    ▼
Step 4: 社区摘要向量化
    │
    └── 社区摘要做 embedding → 存入 Community.embedding
```

**触发时机**：
- 单篇笔记索引后：自动执行 Step 1（实体/关系提取）
- 社区发现（Step 2-4）：每次索引后自动执行

### 写入策略

1. 先查询 Neo4j，该笔记是否已有概念关联
2. 有则删除旧关联
3. LLM 提取新概念和关系
4. 合并去重（同名概念只保留一个）
5. 写入 Neo4j
6. 触发社区发现重新计算

### 日志输出

`notes` 表新增字段：
```sql
graph_sync_status TEXT CHECK (graph_sync_status IN ('idle','extracting','writing','community_discovering','summarizing','done','failed')),
graph_sync_logs JSONB DEFAULT '[]',
graph_sync_error TEXT,
graph_synced_at TIMESTAMP
```

日志结构：
```typescript
interface GraphSyncLog {
  step: 'extract' | 'write' | 'community_discover' | 'summarize';
  status: 'started' | 'completed' | 'failed';
  timestamp: Date;
  detail: {
    entity_count?: number;
    relation_count?: number;
    community_count?: number;
    concepts_per_community?: number[];
    summary_length?: number;
  };
  duration_ms: number;
}
```

## 阶段 3：知识提炼 UI

### 目标
用户可手动从对话/笔记中提炼结构化知识产物。

### 触发入口

| 位置 | 方式 |
|------|------|
| 笔记编辑器 | 工具栏"提炼知识"按钮 |
| 对话消息 | 消息气泡操作菜单 → "提炼知识" |
| 笔记列表 | 右键菜单 → "提炼知识" |

### Extraction Job 模型

新建 `extraction_jobs` 表：
```sql
id UUID PRIMARY KEY,
user_id UUID REFERENCES users(id),
source_type TEXT CHECK (source_type IN ('note','conversation','document')),
source_id UUID,
status TEXT CHECK (status IN ('pending','preprocessing','extracting','generating','completed','failed')),
current_step TEXT,
logs JSONB DEFAULT '[]',
output JSONB,
user_feedback JSONB,
error TEXT,
created_at TIMESTAMP,
completed_at TIMESTAMP
```

### 提炼流程

```
用户点击"提炼"
    │
    ▼
创建 Job (pending)
    │
    ▼
预处理（清洗、去噪）— 记录日志
    │
    ▼
实体/关系提取 — 复用阶段 2 的 extractEntitiesAndRelations()
    │
    ▼
额外生成 — 调用 LLM
    ├── 笔记摘要（200-500 字要点）
    └── 闪卡（2-5 张 front/back）
    │
    ▼
输出结构化结果 → 存入 Job.output
    │
    ▼
前端展示预览界面
    │
    ▼
用户选择采纳项 → 写入数据库
```

### 预览界面

弹窗/侧边面板，4 个 Tab：

| Tab | 内容 | 操作 |
|-----|------|------|
| 摘要 | AI 生成的笔记摘要 | 采纳为笔记（可编辑标题）/ 忽略 |
| 闪卡 | 问答卡片列表 | 每张单独采纳/忽略/编辑 |
| 概念 | 提取的概念节点 | 每个采纳/忽略 |
| 关系 | 概念间关系 | 每个采纳/忽略 |

用户可选择部分采纳，不必全部接受。

### 采纳入库

| 产物 | 入库位置 | 说明 |
|------|----------|------|
| 摘要 | PostgreSQL `notes` 表 | 新建笔记，不替换原文，source_type='extraction' |
| 闪卡 | `cards` 表（需新建） | front/back/tags，可关联原 note |
| 概念 | Neo4j `(:Concept)` | 复用阶段 2 写入逻辑 |
| 关系 | Neo4j `[:RELATED_TO]` 等 | 复用阶段 2 写入逻辑 |

用户采纳的概念/关系写入 Neo4j 后，**自动触发社区发现重新计算**。

### 日志结构

```typescript
interface ExtractionLog {
  step: 'preprocess' | 'extract' | 'generate_summary' | 'generate_cards';
  status: 'started' | 'completed' | 'failed';
  timestamp: Date;
  detail: object;
  duration_ms: number;
}
```

前端实时显示 Job 进度条 + 当前步骤 + 展开查看详细日志。

## 前端配置界面设计

### 新增"检索与重排序"设置 Tab

在设置页面（`/settings`）新增一个 Tab：

```
┌─────────────────────────────────────────────────────────┐
│  AI 模型  │  导师人格  │  【检索与重排序】  │  ...      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  【检索参数】                                            │
│  向量检索 TOP-K        [ 10 ▼ ]                         │
│  ├─ 每路向量检索返回的候选数量                            │
│  全文检索 TOP-K        [ 10 ▼ ]                         │
│  ├─ 每路全文检索返回的候选数量                            │
│  Local Search TOP-K    [ 10 ▼ ]                         │
│  ├─ 图谱局部搜索返回的候选数量                            │
│  Global Search TOP-K   [  5 ▼ ]                         │
│  ├─ 图谱全局搜索返回的社区数量                            │
│                                                         │
│  【RRF 融合参数】                                        │
│  RRF k 值              [ 60 ▼ ]                         │
│  ├─ 平滑常数，越大则低排名文档越不被惩罚。推荐值 60        │
│  RRF 取前 N            [ 10 ▼ ]                         │
│  ├─ 融合后进入重排序的候选数量                            │
│                                                         │
│  【重排序】                                              │
│  [✓] 启用重排序                                         │
│  重排序模型            [ GLM-4-Flash ▼ ]                │
│  ├─ 用于对检索结果进行精排的模型。建议选择轻量、低成本模型  │
│  重排序取前 N          [  5 ▼ ]                         │
│  ├─ 最终注入上下文的文档数量                              │
│                                                         │
│  【上下文预算】                                          │
│  检索上下文预算        [ 1500 ▼ ] tokens                │
│  ├─ 检索结果占用的上下文 token 上限                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 数据模型变更汇总

### PostgreSQL

**`notes` 表新增字段**：
- `index_status`, `index_logs`, `index_error`, `indexed_at`
- `graph_sync_status`, `graph_sync_logs`, `graph_sync_error`, `graph_synced_at`

**新建表**：
- `user_retrieval_settings` — 用户检索与重排序参数配置
- `extraction_jobs` — 知识提炼任务
- `cards` — 闪卡（v0.3 复习系统的前置）

### Neo4j

- `(:Concept)` — 概念节点
- `(:Note)` — 笔记引用节点
- `(:Community)` — 社区节点（新增）
- 关系：`IS_A`, `PART_OF`, `PREREQUISITE_OF`, `RELATED_TO`, `COVERS`, `BELONGS_TO`（新增）

## 接口汇总

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/notes/:id/index` | 触发笔记索引 |
| GET | `/api/notes/:id/index-status` | 查询索引状态 |
| GET | `/api/retrieval/settings` | 获取用户检索配置 |
| PUT | `/api/retrieval/settings` | 更新用户检索配置 |
| POST | `/api/extraction/jobs` | 创建提炼任务 |
| GET | `/api/extraction/jobs/:id` | 查询任务状态和结果 |
| POST | `/api/extraction/jobs/:id/adopt` | 采纳提炼产物 |

## 实现顺序

1. 阶段 1：切分 → 向量化 → 4 路检索 → RRF → 重排序 → 上下文注入
2. 阶段 2：实体/关系提取 → Neo4j 写入 → 社区发现 → 社区摘要 → 图谱查询
3. 阶段 3：Extraction Job → 预览 UI → 采纳入库
