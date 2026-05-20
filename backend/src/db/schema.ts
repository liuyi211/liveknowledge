import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, real, vector, foreignKey, customType, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
  sourceType: text('source_type', { enum: ['note', 'conversation', 'document', 'import'] }).notNull(),
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

export const importSources = pgTable('import_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  sourceType: text('source_type', { enum: ['document', 'import'] }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userSourceHashIdx: uniqueIndex('idx_import_sources_user_type_hash').on(table.userId, table.sourceType, table.contentHash),
}));

export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  noteId: uuid('note_id').references(() => notes.id),
  front: text('front').notNull(),
  back: text('back').notNull(),
  type: text('type', { enum: ['basic', 'cloze', 'image_occlusion'] }).default('basic').notNull(),
  tags: text('tags').array(),
  difficulty: real('difficulty').default(6).notNull(),
  halfLife: real('half_life').default(1).notNull(),
  retrievability: real('retrievability').default(1).notNull(),
  lastReviewedAt: timestamp('last_reviewed_at'),
  nextReviewAt: timestamp('next_review_at').defaultNow().notNull(),
  reviewCount: integer('review_count').default(0).notNull(),
  lapseCount: integer('lapse_count').default(0).notNull(),
  suspended: boolean('suspended').default(false).notNull(),
  qualityReviewedAt: timestamp('quality_reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  dueIdx: index('idx_cards_due').on(table.userId, table.nextReviewAt),
  noteIdx: index('idx_cards_note').on(table.noteId),
}));

export const cardReviews = pgTable('card_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(),
  responseTimeMs: integer('response_time_ms').default(0).notNull(),
  halfLifeBefore: real('half_life_before').notNull(),
  halfLifeAfter: real('half_life_after').notNull(),
  difficultyBefore: real('difficulty_before').notNull(),
  difficultyAfter: real('difficulty_after').notNull(),
  retrievabilityBefore: real('retrievability_before').notNull(),
  retrievabilityAfter: real('retrievability_after').notNull(),
  reviewedAt: timestamp('reviewed_at').defaultNow().notNull(),
}, (table) => ({
  cardIdx: index('idx_card_reviews_card').on(table.cardId, table.reviewedAt),
  userIdx: index('idx_card_reviews_user').on(table.userId, table.reviewedAt),
}));

export const concepts = pgTable('concepts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 200 }).notNull(),
  normalizedLabel: varchar('normalized_label', { length: 200 }).notNull(),
  description: text('description'),
  domain: varchar('domain', { length: 120 }),
  aliases: text('aliases').array(),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: uuid('source_id'),
  confidence: real('confidence').default(0.8).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userNormalizedIdx: uniqueIndex('idx_concepts_user_normalized').on(table.userId, table.normalizedLabel),
  userLabelIdx: index('idx_concepts_user_label').on(table.userId, table.label),
}));

export const conceptRelations = pgTable('concept_relations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceConceptId: uuid('source_concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  targetConceptId: uuid('target_concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  relationType: varchar('relation_type', { length: 50 }).notNull(),
  weight: real('weight').default(1).notNull(),
  evidence: text('evidence'),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: uuid('source_id'),
  confidence: real('confidence').default(0.8).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userSourceIdx: index('idx_concept_relations_user_source').on(table.userId, table.sourceConceptId),
  userTargetIdx: index('idx_concept_relations_user_target').on(table.userId, table.targetConceptId),
  uniqueRelationIdx: uniqueIndex('idx_concept_relations_unique').on(
    table.userId,
    table.sourceConceptId,
    table.targetConceptId,
    table.relationType
  ),
}));

export const noteConcepts = pgTable('note_concepts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  noteId: uuid('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  conceptId: uuid('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).default('mentions').notNull(),
  confidence: real('confidence').default(0.8).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  noteIdx: index('idx_note_concepts_note').on(table.noteId),
  conceptIdx: index('idx_note_concepts_concept').on(table.conceptId),
  uniqueNoteConceptIdx: uniqueIndex('idx_note_concepts_unique').on(table.userId, table.noteId, table.conceptId),
}));

export const cardConcepts = pgTable('card_concepts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  conceptId: uuid('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).default('tests').notNull(),
  confidence: real('confidence').default(0.8).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  cardIdx: index('idx_card_concepts_card').on(table.cardId),
  conceptIdx: index('idx_card_concepts_concept').on(table.conceptId),
  uniqueCardConceptIdx: uniqueIndex('idx_card_concepts_unique').on(table.userId, table.cardId, table.conceptId),
}));
