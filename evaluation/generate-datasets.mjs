import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'datasets');
mkdirSync(outDir, { recursive: true });

const topics = [
  {
    id: 'rag-query-rewrite',
    title: 'RAG Query Rewrite',
    tags: ['rag', 'query rewrite', 'retrieval'],
    keywords: ['query rewrite', 'sub query', 'intent', 'session summary', 'keywords'],
    content: 'Query Rewrite rewrites a conversational question into a retrieval friendly query. It removes greetings, resolves pronouns with the session summary, extracts keywords, decomposes complex questions into sub queries, and labels intent such as QA, summary, comparison, or calculation. In LiveKnowledge it runs before vector search, full text search, HyDE, and graph expansion, so downstream retrieval receives cleaner search terms.',
  },
  {
    id: 'rag-hyde',
    title: 'HyDE Retrieval',
    tags: ['rag', 'hyde', 'embedding'],
    keywords: ['hyde', 'hypothetical answer', 'ambiguous question', 'embedding'],
    content: 'HyDE creates a short hypothetical answer for vague or short questions. The answer is embedded and used as an additional semantic retrieval query. This helps when the original query has too few concrete terms. LiveKnowledge keeps the original query for keyword retrieval while using the HyDE vector as an auxiliary semantic signal.',
  },
  {
    id: 'rag-rrf',
    title: 'Reciprocal Rank Fusion',
    tags: ['rag', 'rrf', 'fusion'],
    keywords: ['rrf', 'reciprocal rank fusion', 'rank', 'fusion', 'k'],
    content: 'Reciprocal Rank Fusion combines ranked lists from multiple retrievers. Each document receives a score based on 1 divided by k plus its rank. The method is robust when vector search, full text search, and graph search return different but useful candidates. LiveKnowledge applies RRF before reranking.',
  },
  {
    id: 'rag-rerank',
    title: 'RAG Rerank',
    tags: ['rag', 'rerank', 'llm'],
    keywords: ['rerank', 'relevance score', 'top n', 'evidence'],
    content: 'Rerank evaluates fused retrieval candidates and keeps the most useful evidence for the final prompt. A lightweight model scores whether a chunk can answer the user question. This reduces unrelated context and improves the evidence density of the final RAG prompt.',
  },
  {
    id: 'vector-pgvector',
    title: 'pgvector Indexing',
    tags: ['pgvector', 'embedding', 'postgresql'],
    keywords: ['pgvector', 'embedding', 'cosine', 'hnsw', 'vector search'],
    content: 'pgvector stores dense embedding vectors in PostgreSQL and supports nearest neighbor search. LiveKnowledge stores note chunks with source id, chunk index, metadata, and embedding vector. Vector search retrieves semantically similar chunks and is one branch of the hybrid retrieval pipeline.',
  },
  {
    id: 'fulltext-postgres',
    title: 'PostgreSQL Full Text Search',
    tags: ['postgresql', 'full text', 'keyword'],
    keywords: ['full text search', 'tsvector', 'keyword', 'ilike', 'postgresql'],
    content: 'PostgreSQL full text search indexes note titles and content with a tsvector column. It is useful for exact keywords, technical terms, abbreviations, and names that may not be captured reliably by embeddings. LiveKnowledge also has an ILIKE fallback for simple keyword matching.',
  },
  {
    id: 'graph-neo4j',
    title: 'Neo4j Graph Retrieval',
    tags: ['neo4j', 'knowledge graph', 'graphrag'],
    keywords: ['neo4j', 'concept', 'relation', 'graph search', 'local search'],
    content: 'Neo4j stores concepts and relations such as prerequisite, part of, related to, and contrasts with. Graph retrieval expands from extracted entities to neighboring concepts and relation paths. This helps answer questions requiring relationships across notes, cards, and concepts.',
  },
  {
    id: 'context-budget',
    title: 'RAG Context Budget',
    tags: ['rag', 'prompt', 'context'],
    keywords: ['context budget', 'token budget', 'dedupe', 'source id', 'prompt'],
    content: 'Context budget control limits the amount of retrieved material injected into the system prompt. LiveKnowledge deduplicates by source, keeps high ranking evidence first, and stops when the estimated token budget is exhausted. This reduces prompt cost and avoids burying useful evidence under redundant chunks.',
  },
  {
    id: 'chunking-markdown',
    title: 'Structure Aware Chunking',
    tags: ['chunking', 'markdown', 'indexing'],
    keywords: ['chunking', 'markdown', 'heading path', 'overlap', 'metadata'],
    content: 'Structure aware chunking splits Markdown by headings and plain text by paragraphs or sentence boundaries. Each chunk keeps metadata such as source id, chunk index, heading path, start index, and end index. Overlap preserves local continuity while keeping chunks small enough for embedding.',
  },
  {
    id: 'incremental-index',
    title: 'Incremental Indexing',
    tags: ['indexing', 'embedding', 'hash'],
    keywords: ['incremental indexing', 'content hash', 'chunk hash', 'skip embedding', 'upsert'],
    content: 'Incremental indexing compares normalized chunk hashes before calling the embedding provider. Unchanged chunks are skipped, changed chunks are embedded again, and deleted chunks are removed. This avoids repeated embedding calls and makes document updates faster.',
  },
  {
    id: 'embedding-batch',
    title: 'Batch Embedding',
    tags: ['embedding', 'performance', 'batch'],
    keywords: ['batch embedding', 'batch size', 'api call', 'latency'],
    content: 'Batch embedding sends multiple chunk texts in one request to reduce per request overhead. LiveKnowledge groups chunks before inserting embedding records. This is especially useful when indexing many notes or long documents.',
  },
  {
    id: 'ai-provider',
    title: 'AI Provider Abstraction',
    tags: ['ai provider', 'openai compatible', 'model'],
    keywords: ['provider', 'openai', 'deepseek', 'zhipu', 'moonshot', 'qwen'],
    content: 'The AI Provider abstraction hides differences between OpenAI compatible services. It records base URL, model id, purpose, streaming support, reasoning support, vision support, context window, and embedding dimensions. User API keys are encrypted before storage.',
  },
  {
    id: 'sse-chat',
    title: 'SSE Streaming Chat',
    tags: ['sse', 'chat', 'streaming'],
    keywords: ['sse', 'streaming', 'abort', 'regenerate', 'thinking'],
    content: 'SSE streaming chat sends model output tokens to the frontend as they arrive. LiveKnowledge supports aborting generation, regenerating assistant messages, editing and resending user messages, and displaying reasoning or thinking content separately from final answer text.',
  },
  {
    id: 'persona-system',
    title: 'Persona Prompt System',
    tags: ['persona', 'prompt', 'chat'],
    keywords: ['persona', 'system prompt', 'teaching style', 'session context'],
    content: 'Personas define system prompt templates and teaching styles. A session can switch persona while retaining a context summary. This lets the assistant behave as a direct tutor, Socratic tutor, or scaffolded mentor while using the same knowledge base.',
  },
  {
    id: 'cognitive-profile',
    title: 'Cognitive Profile',
    tags: ['profile', 'personalization', 'learning'],
    keywords: ['cognitive profile', 'learning style', 'attention span', 'mastery', 'weak point'],
    content: 'The cognitive profile summarizes learning style, attention span, preferred difficulty, domain mastery, and weak points. The chat prompt can use this summary to adjust explanation depth, pace, and review suggestions without exposing raw profile fields to the user.',
  },
  {
    id: 'extraction-job',
    title: 'Knowledge Extraction Job',
    tags: ['extraction', 'job', 'llm'],
    keywords: ['extraction job', 'summary', 'flashcard', 'entity', 'relation', 'logs'],
    content: 'Knowledge extraction turns notes, conversations, or documents into summaries, flashcards, entities, and relations. Each job records input snapshot, content hash, status, current step, logs, output, and user adoption metadata. This makes AI generated knowledge auditable.',
  },
  {
    id: 'card-generation',
    title: 'Flashcard Generation',
    tags: ['flashcard', 'extraction', 'review'],
    keywords: ['flashcard', 'front', 'back', 'adopt', 'note'],
    content: 'Flashcard generation creates question and answer pairs from extracted learning material. Users can preview generated cards and adopt selected results into the review system. Cards may link back to notes and concepts for traceability.',
  },
  {
    id: 'sspmc-half-life',
    title: 'SSP-MMC Half Life Review',
    tags: ['review', 'sspmc', 'memory'],
    keywords: ['half life', 'retrievability', 'difficulty', 'again', 'good'],
    content: 'The review scheduler uses a memory half life model. A card rating updates difficulty, half life, retrievability, lapse count, and next review time. Again shortens half life and increases difficulty, while Good and Easy extend the interval.',
  },
  {
    id: 'review-queue',
    title: 'Review Queue API',
    tags: ['review', 'api', 'queue'],
    keywords: ['review queue', 'next review', 'due card', 'rating', 'history'],
    content: 'The review queue selects cards whose next review time is due, orders them for practice, records each rating and response time, and updates the card state. Review logs preserve half life before and after each rating.',
  },
  {
    id: 'notes-editor',
    title: 'Notes Editor',
    tags: ['notes', 'markdown', 'latex'],
    keywords: ['note editor', 'markdown', 'latex', 'autosave', 'version'],
    content: 'The note editor supports Markdown, code blocks, tags, folders, source metadata, and version conflict handling. Notes can be indexed into embeddings and used by RAG retrieval.',
  },
  {
    id: 'file-handler',
    title: 'File Handler',
    tags: ['file', 'pdf', 'document'],
    keywords: ['pdf', 'docx', 'image', 'url', 'extract text'],
    content: 'The file handler extracts text from uploaded documents and prepares non text attachments for chat. PDF and document text can be inserted into conversation context or sent to the extraction pipeline for note and card generation.',
  },
  {
    id: 'api-auth',
    title: 'Authentication and Session',
    tags: ['auth', 'session', 'fastify'],
    keywords: ['auth', 'session', 'cookie', 'user', 'fastify'],
    content: 'Authentication protects user data with session based access control. Routes load the authenticated user before reading notes, messages, provider settings, cards, and profile data. This keeps the local first knowledge base separated per user.',
  },
  {
    id: 'dashboard',
    title: 'Learning Dashboard',
    tags: ['dashboard', 'analytics', 'learning'],
    keywords: ['dashboard', 'streak', 'review completion', 'domain mastery', 'statistics'],
    content: 'The learning dashboard aggregates study time, review completion, streaks, note counts, card counts, domain distribution, retention, and cognitive profile summaries. It helps users inspect the health of their learning system.',
  },
  {
    id: 'd3-graph-ui',
    title: 'D3 Knowledge Graph UI',
    tags: ['d3', 'graph', 'frontend'],
    keywords: ['d3', 'force graph', 'node', 'edge', 'filter'],
    content: 'The graph UI uses D3 force layout to render concepts, notes, cards, and tags. Users can zoom, drag, filter by node type or domain, and inspect details before jumping back to the source note or card.',
  },
];

const questionTemplates = [
  'How does {title} work in LiveKnowledge?',
  'What problem does {title} solve?',
  'Which metadata or state is important for {title}?',
  'When should the system use {title}?',
  'How is {title} connected to the learning loop?',
];

const primaryCorpus = topics.map((topic) => ({
  sourceId: topic.id,
  title: topic.title,
  tags: topic.tags,
  keywords: topic.keywords,
  content: `# ${topic.title}\n\n${topic.content}\n\nKey terms: ${topic.keywords.join(', ')}.`,
  relations: relatedTopicIds(topic.id),
}));

const decoyCorpus = [];
for (const topic of topics) {
  for (let i = 1; i <= 4; i += 1) {
    const related = topics[(topics.findIndex((item) => item.id === topic.id) + i) % topics.length];
    decoyCorpus.push({
      sourceId: `${topic.id}-decoy-${i}`,
      title: `${topic.title} Related Note ${i}`,
      tags: Array.from(new Set([...(topic.tags || []).slice(0, 1), ...(related.tags || []).slice(0, 1), 'decoy'])),
      keywords: Array.from(new Set([...topic.keywords.slice(0, 2), ...related.keywords.slice(0, 2)])),
      content: [
        `# ${topic.title} Related Note ${i}`,
        `This note mentions ${topic.title} but mainly discusses ${related.title}.`,
        related.content,
        `Cross reference terms: ${topic.keywords.slice(0, 2).join(', ')}; ${related.keywords.slice(0, 2).join(', ')}.`,
      ].join('\n\n'),
      relations: [topic.id, related.id, ...relatedTopicIds(related.id).slice(0, 2)],
    });
  }
}

const corpus = [...primaryCorpus, ...decoyCorpus];

const questions = [];
let questionId = 1;
for (const topic of topics) {
  for (const template of questionTemplates) {
    questions.push({
      id: `q${String(questionId).padStart(3, '0')}`,
      query: template.replace('{title}', topic.title),
      goldSourceIds: [topic.id],
      goldKeywords: topic.keywords.slice(0, 3),
    });
    questionId++;
  }
}

for (let i = 14; i < questions.length; i += 15) {
  questions[i].query = 'How does this feature work in the learning system?';
  questions[i].goldKeywords = ['ambiguous', 'context dependent'];
}

const indexingDocs = Array.from({ length: 100 }, (_, index) => {
  const topic = topics[index % topics.length];
  const variant = Math.floor(index / topics.length) + 1;
  const repeated = [
    `${topic.title} is part of the LiveKnowledge learning workflow.`,
    topic.content,
    `This document variant ${variant} explains implementation details, expected inputs, outputs, and failure modes.`,
    `The system keeps local first data, standardized metadata, and traceable logs so knowledge can be reused by chat, extraction, review, and graph modules.`,
    `Operationally, the indexer should normalize content, split stable chunks, compute chunk hashes, skip unchanged chunks, call embedding in batches, and upsert records by source id and chunk index.`,
  ].join(' ');
  const content = `${repeated} ${repeated}`;
  return {
    id: `doc-${String(index + 1).padStart(3, '0')}`,
    title: `${topic.title} Benchmark Document ${variant}`,
    sourceTopicId: topic.id,
    content,
    updatedContent: index % 3 === 0
      ? `${content}\n\nUpdated note: this version adds one paragraph about measuring latency, skipped embeddings, and context token usage.`
      : content,
  };
});

const contextQueries = questions.slice(0, 100).map((question, index) => ({
  id: `ctx-${String(index + 1).padStart(3, '0')}`,
  query: question.query,
  goldSourceIds: question.goldSourceIds,
}));

writeJsonl('rag_corpus.jsonl', corpus);
writeJsonl('rag_recall_questions.jsonl', questions);
writeJsonl('indexing_documents.jsonl', indexingDocs);
writeJsonl('context_queries.jsonl', contextQueries);

console.log(`Generated ${corpus.length} corpus docs`);
console.log(`Generated ${questions.length} recall questions`);
console.log(`Generated ${indexingDocs.length} indexing documents`);
console.log(`Generated ${contextQueries.length} context queries`);

function writeJsonl(name, rows) {
  writeFileSync(join(outDir, name), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

function relatedTopicIds(id) {
  const relations = {
    'rag-query-rewrite': ['rag-hyde', 'rag-rrf', 'context-budget'],
    'rag-hyde': ['rag-query-rewrite', 'vector-pgvector'],
    'rag-rrf': ['vector-pgvector', 'fulltext-postgres', 'graph-neo4j', 'rag-rerank'],
    'rag-rerank': ['rag-rrf', 'context-budget'],
    'vector-pgvector': ['embedding-batch', 'incremental-index'],
    'fulltext-postgres': ['rag-rrf'],
    'graph-neo4j': ['d3-graph-ui', 'rag-rrf'],
    'context-budget': ['rag-rerank', 'chunking-markdown'],
    'chunking-markdown': ['incremental-index', 'vector-pgvector'],
    'incremental-index': ['embedding-batch', 'chunking-markdown'],
    'embedding-batch': ['incremental-index', 'vector-pgvector'],
    'ai-provider': ['sse-chat', 'vector-pgvector'],
    'sse-chat': ['ai-provider', 'persona-system'],
    'persona-system': ['cognitive-profile', 'sse-chat'],
    'cognitive-profile': ['review-queue', 'persona-system'],
    'extraction-job': ['card-generation', 'graph-neo4j'],
    'card-generation': ['sspmc-half-life', 'review-queue'],
    'sspmc-half-life': ['review-queue', 'cognitive-profile'],
    'review-queue': ['sspmc-half-life', 'dashboard'],
    'notes-editor': ['chunking-markdown', 'file-handler'],
    'file-handler': ['extraction-job', 'notes-editor'],
    'api-auth': ['ai-provider', 'notes-editor'],
    'dashboard': ['review-queue', 'cognitive-profile'],
    'd3-graph-ui': ['graph-neo4j', 'dashboard'],
  };
  return relations[id] ?? [];
}
