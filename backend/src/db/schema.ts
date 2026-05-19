import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, real, vector, foreignKey, customType, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiProviderConfigs = pgTable('ai_provider_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  providerType: varchar('provider_type', { length: 50 }).notNull(),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  baseUrl: text('base_url'),
  model: varchar('model', { length: 100 }),
  purpose: varchar('purpose', { length: 20 }).notNull().default('chat'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const personas = pgTable('personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  avatar: text('avatar'),
  systemPromptTemplate: text('system_prompt_template').notNull(),
  teachingStyle: jsonb('teaching_style'),
  knowledgeDomains: text('knowledge_domains').array(),
  defaultModel: varchar('default_model', { length: 100 }),
  isBuiltin: boolean('is_builtin').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  personaId: uuid('persona_id').references(() => personas.id),
  modelId: varchar('model_id', { length: 100 }),
  title: varchar('title', { length: 200 }).default('New Chat'),
  messageCount: integer('message_count').default(0).notNull(),
  lastMessagePreview: varchar('last_message_preview', { length: 200 }),
  contextSummary: text('context_summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  modelId: varchar('model_id', { length: 100 }),
  tokensUsed: integer('tokens_used'),
  parentId: uuid('parent_id'),
  version: integer('version').default(1).notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  feedback: varchar('feedback', { length: 10 }),
  thinkingContent: text('thinking_content'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }).notNull(),
  extractedText: text('extracted_text'),
  base64: text('base64'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  parentId: uuid('parent_id'),
  name: varchar('name', { length: 200 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  parentFk: foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
  }).onDelete('cascade'),
}));

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').default('').notNull(),
  tags: text('tags').array(),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: uuid('source_id'),
  sourceMetadata: jsonb('source_metadata'),
  version: integer('version').default(1).notNull(),
  indexStatus: text('index_status', { enum: ['idle', 'chunking', 'embedding', 'storing', 'done', 'failed'] }).default('idle'),
  indexLogs: jsonb('index_logs').default('[]'),
  indexError: text('index_error'),
  indexedAt: timestamp('indexed_at'),
  graphSyncStatus: text('graph_sync_status', { enum: ['idle', 'extracting', 'writing', 'community_discovering', 'summarizing', 'done', 'failed'] }).default('idle'),
  graphSyncLogs: jsonb('graph_sync_logs').default('[]'),
  graphSyncError: text('graph_sync_error'),
  graphSyncedAt: timestamp('graph_synced_at'),
  searchVector: tsvector('search_vector').generatedAlwaysAs(
    sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))`
  ),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  searchVectorIdx: index('idx_notes_search_vector').using('gin', table.searchVector),
}));

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  sourceId: uuid('source_id').notNull(),
  chunkIndex: integer('chunk_index').default(0).notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userRetrievalSettings = pgTable('user_retrieval_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  vectorTopK: integer('vector_top_k').default(10),
  fullTextTopK: integer('full_text_top_k').default(10),
  localSearchTopK: integer('local_search_top_k').default(10),
  globalSearchTopK: integer('global_search_top_k').default(5),
  rrfK: integer('rrf_k').default(60),
  rrfTopN: integer('rrf_top_n').default(10),
  rerankEnabled: boolean('rerank_enabled').default(true),
  rerankProviderConfigId: uuid('rerank_provider_config_id').references(() => aiProviderConfigs.id),
  rerankModel: text('rerank_model'),
  rerankTopN: integer('rerank_top_n').default(5),
  contextBudgetTokens: integer('context_budget_tokens').default(1500),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const extractionJobs = pgTable('extraction_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  sourceType: text('source_type', { enum: ['note', 'conversation', 'document'] }).notNull(),
  sourceId: uuid('source_id').notNull(),
  status: text('status', { enum: ['pending', 'preprocessing', 'extracting', 'generating', 'completed', 'failed'] }).default('pending'),
  currentStep: text('current_step'),
  logs: jsonb('logs').default('[]'),
  output: jsonb('output'),
  userFeedback: jsonb('user_feedback'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  noteId: uuid('note_id').references(() => notes.id),
  front: text('front').notNull(),
  back: text('back').notNull(),
  tags: text('tags').array(),
  createdAt: timestamp('created_at').defaultNow(),
});
