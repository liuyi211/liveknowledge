# LiveKnowledge Evaluation

This directory contains a reproducible fixture benchmark for the four resume metrics:

- `Recall@6`
- Average ingestion latency
- Duplicate embedding calls
- Average RAG context tokens

The default scripts run offline and do not require database credentials or model API keys. Use the numbers as a local benchmark result only. If you want production-grade numbers, keep the same formulas and collect the same events from the real indexing and retrieval pipeline.

## Generate Datasets

```bash
node evaluation/generate-datasets.mjs
```

Generated files:

- `evaluation/datasets/rag_corpus.jsonl`: 24 source documents.
- `evaluation/datasets/rag_recall_questions.jsonl`: 120 labeled recall questions.
- `evaluation/datasets/indexing_documents.jsonl`: 100 documents with 500+ characters.
- `evaluation/datasets/context_queries.jsonl`: 100 context-quality queries.

## Run Metrics

```bash
node evaluation/run-metrics.mjs
```

Optional output path:

```bash
node evaluation/run-metrics.mjs --output evaluation/outputs/my-result.json
```

The script prints a summary and writes full details to JSON.

## Metric Definitions

### Recall@6

For each question, compare the top 6 retrieved source ids against `goldSourceIds`.

```text
Recall@6 = questions with at least one gold hit in Top6 / total questions
```

The script reports:

- baseline: vector-only retrieval
- optimized: vector + keyword + graph expansion + RRF + rerank

### Average Ingestion Latency

The script simulates indexing 100 documents.

```text
average_ingestion_ms = total indexing time / document count
reduction = (baseline_avg_ms - optimized_avg_ms) / baseline_avg_ms
```

Baseline embeds every chunk on every pass. Optimized indexing uses normalized chunk hashes and skips unchanged chunks.

### Duplicate Embedding Calls

```text
avoidance_rate = skipped_embeddings / requested_embeddings
call_reduction = (baseline_embedding_calls - optimized_embedding_calls) / baseline_embedding_calls
```

### Average RAG Context Tokens

```text
average_context_tokens = total final context tokens / query count
reduction = (baseline_avg_tokens - optimized_avg_tokens) / baseline_avg_tokens
```

Baseline injects the top 10 vector results. Optimized context uses hybrid retrieval, source deduplication, evidence compression, and a token budget.

## How To Convert This To Real Project Metrics

Add structured logs around the real pipeline:

- indexing start/end time
- parse/chunk/embedding/db-write stage duration
- requested chunk count
- skipped chunk count
- actual embedding call count
- retrieval top results with source id/chunk id
- final RAG context token count

Then reuse the formulas above with real logs instead of fixture results.

## QASPER Semantic Chunk Recall@5

Use this script when you want a real public-dataset metric for semantic-boundary chunking.

Install optional dependency:

```bash
pip install datasets
```

Run on the HuggingFace QASPER validation split:

```bash
python evaluation/qasper_chunk_recall.py --split validation --limit-questions 300 --top-k 5
```

If you already downloaded QASPER as JSON/JSONL:

```bash
python evaluation/qasper_chunk_recall.py --input path/to/qasper.jsonl --limit-questions 300 --top-k 5
```

Outputs:

- `evaluation/outputs/qasper-chunk-recall.json`
- `evaluation/outputs/qasper-chunk-recall.md`

The report contains the resume-ready sentence:

```text
基于 QASPER 论文问答子集评估，对比固定长度切分，语义边界 chunk 将 Evidence Recall@5 从 X% 提升至 Y%。
```
