# LiveKnowledge

<p align="center">
  <strong>活的本地知识库：对话、提炼、复习、图谱与认知画像一体化的个人学习伴侣。</strong>
</p>

<p align="center">
  <a href="#中文">中文</a> · <a href="#english">English</a>
</p>

---

## 中文

LiveKnowledge 是一个本地优先的 AI 知识库。它将 AI 学习会话、RAG 检索、知识提炼、间隔重复复习、知识图谱和用户认知画像整合在一起，目标是形成一个持续进化的学习闭环：

```text
对话 -> 提炼 -> 复习 -> 图谱 -> 再对话
```

> 当前项目处于早期开发阶段，README 描述的是仓库中的实现方向与已搭建模块。

### 功能特性

- **AI 学习会话**：支持流式对话、导师人格、模型与 Provider 配置。
- **本地 RAG**：结合向量检索、全文检索、RRF 融合、轻量重排序与上下文预算控制。
- **知识提炼**：从会话、笔记、文档或导入内容中提炼笔记、闪卡、概念和关系。
- **复习系统**：实现基于记忆半衰期的复习调度，并记录质量评分与历史表现。
- **知识图谱**：以概念、笔记、卡片和标签为节点，支持图谱构建、同步与查询。
- **认知画像**：根据学习、复习和记忆表现维护用户风格与掌握度数据。
- **文档导入与处理**：后端提供上传、解析与提炼任务处理能力。
- **仪表盘与设置页**：前端包含学习概览、图谱、笔记、复习、Provider、人格和记忆设置页面。

### 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Next.js App Router, React, Tailwind CSS, Zustand, D3.js, KaTeX |
| 后端 | Node.js, TypeScript, Fastify, Drizzle ORM |
| 关系数据库 | PostgreSQL |
| 向量检索 | pgvector |
| 图数据库 | Neo4j |
| 部署依赖 | Docker Compose |

### 项目结构

```text
liveknowledge/
├── backend/                 # Fastify API, RAG, extraction, review, graph services
│   ├── src/
│   │   ├── routes/          # REST API routes
│   │   ├── services/        # Core application services
│   │   └── db/              # Drizzle schema and migrations
│   └── package.json
├── frontend/                # Next.js frontend application
│   ├── src/app/             # App Router pages
│   ├── src/components/      # UI components
│   └── package.json
├── docs/                    # Design notes and implementation plans
├── evaluation/              # Retrieval and memory evaluation scripts
└── docker-compose.yml       # PostgreSQL + Neo4j
```

### 快速开始

#### 环境要求

- Node.js 20+
- npm
- Docker Desktop 或 Docker Engine

#### 1. 克隆仓库

```bash
git clone <repo-url>
cd liveknowledge
```

#### 2. 启动数据库

```bash
docker compose up -d
```

默认服务：

| 服务 | 地址 | 默认账号 |
| --- | --- | --- |
| PostgreSQL | `localhost:5432` | `lk / lk_password` |
| Neo4j Browser | `http://localhost:7474` | `neo4j / lk_password` |
| Neo4j Bolt | `bolt://localhost:7687` | `neo4j / lk_password` |

#### 3. 配置后端环境变量

在 `backend/.env` 中配置：

```env
DATABASE_URL=postgres://lk:lk_password@localhost:5432/liveknowledge
PORT=3001
SESSION_SECRET=replace-with-a-long-random-secret
MASTER_KEY=replace-with-a-32-byte-encryption-key

NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=lk_password

DEV_AUTO_LOGIN=true
LOG_LEVEL=debug
```

`SESSION_SECRET` 用于会话签名，`MASTER_KEY` 用于加密用户级 Provider API Key。生产环境请使用高强度随机值。

#### 4. 安装依赖并迁移数据库

```bash
cd backend
npm install
npm run db:migrate

cd ../frontend
npm install
```

#### 5. 启动开发服务

在两个终端中分别运行：

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

打开：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:3001`

### 常用命令

后端：

```bash
cd backend
npm run dev          # 开发服务
npm run build        # TypeScript 构建
npm run start        # 运行 dist
npm run db:generate  # 生成 Drizzle migration
npm run db:migrate   # 执行 migration
npm run db:studio    # 打开 Drizzle Studio
```

前端：

```bash
cd frontend
npm run dev          # Next.js 开发服务
npm run build        # 生产构建
npm run start        # 运行生产服务
npm run lint         # Next lint
```

评测：

```bash
cd backend
npm run eval:memory -- --user-id <uuid>
npm run eval:memory -- --user-id <uuid> --category coreference --limit 20
```

### 配置 AI Provider

LiveKnowledge 通过后端 Provider 配置管理模型访问。启动应用后可在设置页中配置 OpenAI 兼容 Provider、base URL、模型和 API Key。API Key 会使用 `MASTER_KEY` 加密后保存在本地数据库中。

### 数据与隐私

LiveKnowledge 默认将用户数据保存在本机 PostgreSQL 和 Neo4j 中。除非你显式配置外部 AI Provider 并发起模型请求，笔记、卡片、画像和图谱数据不会离开本地环境。

### 路线图

- [x] 前后端基础架构
- [x] 会话、消息、笔记、Provider、人格配置
- [x] RAG 检索管线基础实现
- [x] 提炼任务与进度日志
- [x] 复习调度与复习记录
- [x] 知识图谱服务与前端图谱页面
- [x] 认知画像页面与后端服务
- [ ] 更完整的导入向导
- [ ] 更细粒度的图谱编辑体验
- [ ] 生产部署配置与端到端测试

### 许可证

当前仓库尚未声明许可证。发布前请补充 `LICENSE` 文件。

---

## English

LiveKnowledge is a local-first AI knowledge base. It combines AI learning conversations, RAG retrieval, knowledge extraction, spaced repetition, knowledge graphs, and cognitive profiling into a self-reinforcing learning loop:

```text
Conversation -> Extraction -> Review -> Graph -> Better conversation
```

> This project is in early development. This README documents the direction and modules currently present in the repository.

### Features

- **AI learning conversations**: streaming chat, tutor personas, model selection, and provider configuration.
- **Local RAG pipeline**: vector retrieval, full-text retrieval, RRF fusion, lightweight reranking, and context budgeting.
- **Knowledge extraction**: generate notes, flashcards, concepts, and relations from conversations, notes, documents, and imports.
- **Review system**: half-life based scheduling with quality ratings and review history.
- **Knowledge graph**: concepts, notes, cards, and tags as graph nodes with graph build, sync, and query services.
- **Cognitive profile**: user learning style and mastery data derived from learning and review behavior.
- **Document handling**: backend upload, parsing, and extraction task processing.
- **Dashboard and settings**: frontend pages for overview, graph, notes, review, providers, personas, and memory settings.

### Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js App Router, React, Tailwind CSS, Zustand, D3.js, KaTeX |
| Backend | Node.js, TypeScript, Fastify, Drizzle ORM |
| Relational database | PostgreSQL |
| Vector search | pgvector |
| Graph database | Neo4j |
| Local infrastructure | Docker Compose |

### Repository Structure

```text
liveknowledge/
├── backend/                 # Fastify API, RAG, extraction, review, graph services
│   ├── src/
│   │   ├── routes/          # REST API routes
│   │   ├── services/        # Core application services
│   │   └── db/              # Drizzle schema and migrations
│   └── package.json
├── frontend/                # Next.js frontend application
│   ├── src/app/             # App Router pages
│   ├── src/components/      # UI components
│   └── package.json
├── docs/                    # Design notes and implementation plans
├── evaluation/              # Retrieval and memory evaluation scripts
└── docker-compose.yml       # PostgreSQL + Neo4j
```

### Quick Start

#### Requirements

- Node.js 20+
- npm
- Docker Desktop or Docker Engine

#### 1. Clone the Repository

```bash
git clone <repo-url>
cd liveknowledge
```

#### 2. Start Databases

```bash
docker compose up -d
```

Default services:

| Service | URL | Default credentials |
| --- | --- | --- |
| PostgreSQL | `localhost:5432` | `lk / lk_password` |
| Neo4j Browser | `http://localhost:7474` | `neo4j / lk_password` |
| Neo4j Bolt | `bolt://localhost:7687` | `neo4j / lk_password` |

#### 3. Configure Backend Environment Variables

Create or update `backend/.env`:

```env
DATABASE_URL=postgres://lk:lk_password@localhost:5432/liveknowledge
PORT=3001
SESSION_SECRET=replace-with-a-long-random-secret
MASTER_KEY=replace-with-a-32-byte-encryption-key

NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=lk_password

DEV_AUTO_LOGIN=true
LOG_LEVEL=debug
```

`SESSION_SECRET` signs sessions, and `MASTER_KEY` encrypts user-level provider API keys. Use strong random values outside local development.

#### 4. Install Dependencies and Run Migrations

```bash
cd backend
npm install
npm run db:migrate

cd ../frontend
npm install
```

#### 5. Start Development Servers

Run these in two terminals:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

### Common Commands

Backend:

```bash
cd backend
npm run dev          # Development server
npm run build        # TypeScript build
npm run start        # Run dist
npm run db:generate  # Generate Drizzle migration
npm run db:migrate   # Apply migrations
npm run db:studio    # Open Drizzle Studio
```

Frontend:

```bash
cd frontend
npm run dev          # Next.js development server
npm run build        # Production build
npm run start        # Run production server
npm run lint         # Next lint
```

Evaluation:

```bash
cd backend
npm run eval:memory -- --user-id <uuid>
npm run eval:memory -- --user-id <uuid> --category coreference --limit 20
```

### AI Provider Configuration

LiveKnowledge manages model access through backend provider configuration. After starting the app, open the settings page to configure OpenAI-compatible providers, base URLs, models, and API keys. API keys are encrypted with `MASTER_KEY` before being stored in the local database.

### Data and Privacy

LiveKnowledge stores user data in local PostgreSQL and Neo4j instances by default. Notes, cards, profiles, and graph data stay local unless you explicitly configure an external AI provider and send model requests.

### Roadmap

- [x] Frontend and backend foundation
- [x] Sessions, messages, notes, providers, and personas
- [x] Initial RAG pipeline
- [x] Extraction jobs and progress logs
- [x] Review scheduling and review history
- [x] Knowledge graph service and graph page
- [x] Cognitive profile service and page
- [ ] More complete import wizard
- [ ] More granular graph editing experience
- [ ] Production deployment setup and end-to-end tests

### License

No license has been declared yet. Add a `LICENSE` file before public distribution.
