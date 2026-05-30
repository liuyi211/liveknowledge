# LiveKnowledge Evaluation Report

Generated at: 2026-05-25T13:27:51.938Z

## Dataset

- Corpus documents: 120
- Recall questions: 120
- Indexing documents: 100
- Context queries: 100

## Metrics

| Metric | Baseline | Optimized | Change |
|---|---:|---:|---:|
| Recall@6 | 58.33% | 94.17% | 61.43% relative |
| Average ingestion latency | 693.75 ms | 382.28 ms | 44.9% lower |
| Embedding calls | 802 | 435 | 45.76% lower |
| Average context tokens | 1111.6 | 598.21 | 46.18% lower |

## Resume-Friendly Phrasing

- Built a Hybrid RAG pipeline with vector, keyword, and graph retrieval plus RRF and rerank; on a 120-question fixture benchmark, Recall@6 improved from 58.33% to 94.17%.
- Added chunk-hash based incremental indexing; on 100 500+ character documents, average ingestion latency dropped by 44.9%.
- Avoided 91.52% duplicate embedding calls during repeated indexing of unchanged chunks.
- Added source deduplication, evidence compression, and token budgeting; average RAG context tokens dropped by 46.18%.
