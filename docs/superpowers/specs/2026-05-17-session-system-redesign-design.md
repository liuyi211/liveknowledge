# 会话系统重新设计 — 设计文档

## 概述

将会话系统从简陋的原型升级为一个对标 Claude 网页版的高保真聊天体验。保持浅色主题，补全缺失的功能，建立清晰的代码分层。

## 参考产品

Claude 网页版 (claude.ai) — 核心学习对象：消息操作、思考内容展示、文件上传、简洁的两栏布局。

## 设计决策

- **UI 主题**：保持现有浅色主题不变
- **分支对话**：采用"简单回退"方案（仅可编辑最后一条用户消息并重生成，覆盖原回复）
- **文件上传**：支持图片、PDF、文本文件（txt/md/json 等）
- **流式接口**：统一 SSE 端点，通过 `action` 字段区分发送/编辑/重新生成

---

## 数据模型变更

### messages 表新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `parentId` | uuid | 指向被编辑的原消息，用于回退 |
| `version` | integer | 消息版本号，默认 1，编辑后递增 |
| `isDeleted` | boolean | 软删除标记，默认 false |
| `feedback` | varchar(10) | 用户反馈：`like` / `dislike` / null |
| `thinkingContent` | text | 模型的思考/推理内容 |
| `tokensUsed` | integer | 已存在但未使用，本次启用 |

### 新增 attachments 表

```typescript
{
  id: uuid,           // 主键
  messageId: uuid,    // 关联消息
  fileName: string,   // 原始文件名
  fileType: string,   // mime type
  fileSize: integer,  // 字节数
  filePath: string,   // 本地存储路径
  extractedText: string, // PDF/文本提取的内容
  createdAt: timestamp,
}
```

### chatSessions 表新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `messageCount` | integer | 消息数量缓存，默认 0 |
| `lastMessagePreview` | varchar(200) | 最后消息预览，用于列表展示 |

---

## 后端 API

### 会话管理

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/sessions?q=&sort=&limit=&offset=` | 列表（支持搜索、排序、分页） |
| POST | `/api/sessions` | 创建（title, personaId, modelId） |
| GET | `/api/sessions/:id` | 详情（含消息列表） |
| PATCH | `/api/sessions/:id` | 更新（title/personaId/modelId） |
| DELETE | `/api/sessions/:id` | 删除（级联删除消息和附件） |
| POST | `/api/sessions/:id/clear` | 清空会话消息 |

### 消息管理

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/messages/session/:sessionId` | 消息列表（支持分页） |
| POST | `/api/messages/session/:sessionId/stream` | 发送消息（流式 SSE） |
| POST | `/api/messages/session/:sessionId/regenerate` | 重新生成最后一条 AI 回复 |
| PATCH | `/api/messages/:id` | 编辑消息内容 |
| DELETE | `/api/messages/:id` | 删除消息（软删除） |
| POST | `/api/messages/:id/feedback` | 点赞/点踩反馈 |

### 附件上传

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/upload` | 上传文件，返回文件信息 |

### SSE 事件格式

```typescript
// 内容片段
{ type: 'chunk', content: string }

// 思考内容（DeepSeek reasoning 等）
{ type: 'thinking', content: string }

// 完成
{ type: 'done', messageId: string }

// 错误
{ type: 'error', error: string }
```

### 请求体格式（流式端点）

```typescript
{
  content: string,           // 用户输入
  action?: 'send' | 'editAndResend' | 'regenerate', // 默认 send
  messageId?: string,        // editAndResend 时必填
  modelId?: string,          // regenerate 时可指定新模型
  attachments?: Array<{      // 附件信息
    fileName: string,
    fileType: string,
    extractedText?: string,
  }>,
}
```

---

## 文件结构

### 后端

```
backend/src/
├── routes/
│   ├── sessions.ts          ← 重构：增加搜索/分页/清空
│   ├── messages.ts          ← 重构：统一流式接口
│   └── uploads.ts           ← 新增：文件上传处理
├── services/
│   ├── ai-provider.ts       ← 修改：增加多模态支持
│   ├── chat-service.ts      ← 新增：聊天核心逻辑
│   ├── message-service.ts   ← 新增：消息 CRUD + 版本管理
│   ├── session-service.ts   ← 新增：会话 CRUD + 列表查询
│   └── file-handler.ts      ← 新增：文件解析（PDF/图片/文本）
├── db/
│   └── schema.ts            ← 修改：新增字段和 attachments 表
└── types/
    └── chat.ts              ← 新增：会话模块类型定义
```

### 前端

```
frontend/src/
├── app/chat/page.tsx        ← 重构：新布局
├── components/chat/
│   ├── ChatLayout.tsx       ← 重构：整体布局容器
│   ├── SessionSidebar.tsx   ← 新增：左侧会话列表
│   ├── MessageList.tsx      ← 重构：消息列表
│   ├── MessageBubble.tsx    ← 新增：单条消息气泡
│   ├── MessageInput.tsx     ← 重构：多行输入 + 附件 + 模型选择
│   ├── ThinkingBlock.tsx    ← 新增：思考内容折叠展示
│   ├── CodeBlock.tsx        ← 新增：代码块高亮 + 复制
│   ├── StreamingText.tsx    ← 修改：优化
│   └── ChatHeader.tsx       ← 新增：顶部工具栏
├── stores/
│   └── chat-store.ts        ← 新增：聊天专用 store
├── hooks/
│   ├── useStreamingChat.ts  ← 新增：流式聊天逻辑封装
│   └── useMessageActions.ts ← 新增：消息操作封装
└── lib/api.ts               ← 重构：补充所有接口
```

---

## 关键交互流程

### 1. 发送消息（含附件）

1. 用户输入内容 + 选择附件
2. 前端上传附件到 `/api/upload`，获取文件信息
3. 前端发送 SSE 请求到 `/api/messages/session/:id/stream`
4. 后端保存用户消息 → 处理附件（图片构造 multimodal messages，PDF/文本注入 prompt）→ 执行 RAG → 调用 AI Provider → SSE 流式返回
5. 前端实时展示，检测 thinking 内容单独渲染
6. 流结束后刷新消息列表获取完整数据（含 id）

### 2. 编辑最后消息并重生成（简单回退）

1. 用户点击最后一条用户消息的"编辑"按钮
2. 消息变为可编辑 textarea
3. 用户修改后点击"保存并重新生成"
4. 前端发送 `action: 'editAndResend'` 的 SSE 请求
5. 后端标记旧版本消息 isDeleted=true → 创建新版本 → 删除旧 AI 回复 → 重新生成
6. 前端刷新展示新版本消息链

### 3. 重新生成（用不同模型）

1. 用户点击 AI 消息的"重新生成"按钮
2. 可选选择新模型
3. 前端发送 `action: 'regenerate'` 的 SSE 请求
4. 后端软删除最后一条 AI 消息 → 用新模型重新生成 → 保存新回复

### 4. 停止生成

1. 用户点击停止按钮
2. 前端 AbortController 中止 SSE
3. 后端 AbortController 取消 AI Provider 请求
4. 前端将已收到的内容保存为完整消息

---

## 前端 UI 组件

### 整体布局

两栏结构：左侧会话列表（260px）+ 右侧聊天区域（flex-1）。

全局 Sidebar（64px）保持不变，位于最左侧。

### 左侧会话列表（SessionSidebar）

- 顶部：搜索框 + "新对话"按钮
- 中部：会话列表项
  - 标题（可点击编辑，Enter 保存，Esc 取消）
  - 最后消息预览（前 30 字）
  - 相对时间（"2小时前"）
  - 右键菜单：重命名 / 删除 / 清空对话
- 底部：用户名称

### 消息气泡（MessageBubble）

- 用户消息：右侧，蓝色背景（bg-blue-600）
- AI 消息：左侧，灰色背景（bg-gray-100）
- AI 消息下方操作栏：复制 / 重新生成 / 点赞 / 点踩
- 用户消息（最后一条）可编辑

### 思考内容（ThinkingBlock）

- Claude 风格折叠面板
- 默认折叠，显示"已思考 X 秒"
- 展开后显示完整 reasoning 内容
- 浅灰色背景 + 左边框区分

### 输入框（MessageInput）

- 多行 textarea（Shift+Enter 换行，Enter 发送）
- 左下角：附件按钮（📎）
- 右下角：模型选择器下拉框 + 发送按钮
- 有附件时显示文件预览列表（可删除）
- 发送中显示停止按钮（■）

### 顶部工具栏（ChatHeader）

- 中间：当前会话标题（可点击编辑）
- 右侧：当前人格/模型标签（点击可切换）

---

## 状态管理

将聊天状态从 `app-store.ts` 拆出到独立的 `chat-store.ts`：

```typescript
interface ChatStore {
  // 会话列表
  sessions: ChatSession[];
  sessionsLoading: boolean;
  sessionsSearchQuery: string;
  loadSessions: () => Promise<void>;
  createSession: (params) => Promise<ChatSession>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;

  // 当前会话
  currentSession: ChatSession | null;
  setCurrentSession: (session) => void;
  loadSessionMessages: (sessionId: string) => Promise<void>;

  // 消息
  messages: Message[];
  messagesLoading: boolean;
  sendMessage: (content: string, attachments?) => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => Promise<void>;
  regenerateMessage: (messageId: string, modelId?: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  feedbackMessage: (messageId: string, feedback: 'like' | 'dislike') => Promise<void>;

  // 流式状态
  isStreaming: boolean;
  streamingContent: string;
  thinkingContent: string;
  abortStream: () => void;
}
```

---

## 附件处理策略

| 文件类型 | 处理方式 |
|----------|----------|
| 图片（png/jpg/gif/webp） | base64 编码，传给支持 vision 的模型 |
| PDF | 后端用 pdf-parse 提取文本，注入 system prompt |
| 文本文件（txt/md/json/code） | 直接读取内容，作为用户消息的一部分 |
| 其他 | 拒绝上传，提示不支持 |

**存储**：文件保存在 `backend/uploads/` 目录下，按用户 ID 分文件夹。

---

## 思考内容检测

从流式响应中检测思考内容：

1. **DeepSeek-reasoner**：stream 中有 `choices[0].delta.reasoning_content` 字段
2. **通用标签检测**：内容中包含 `<think>...</think>` 标签时，提取为 thinkingContent
3. 前端将 thinkingContent 和 content 分开存储和渲染

---

## 代码块处理

使用 `react-syntax-highlighter` 实现代码高亮：

- 自动检测语言（从 markdown 代码块标注）
- 右上角显示语言标签 + 复制按钮
- 支持一键复制到剪贴板

---

## 边界情况

1. **空会话**：没有消息时显示欢迎语 + 快捷操作（新建对话提示）
2. **会话无模型配置**：弹窗提示用户先配置 AI Provider
3. **附件过大**：单文件限制 10MB，超出提示
4. **流式中断**：网络断开时显示"生成中断"提示，保留已生成内容
5. **编辑非最后消息**：前端禁用非最后一条用户消息的编辑按钮
