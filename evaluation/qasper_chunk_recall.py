#!/usr/bin/env python3
"""
Evaluate semantic-boundary chunking on QASPER with Evidence Recall@5.

Default data loading order:
1. --input local JSON/JSONL file exported from QASPER/HuggingFace.
2. HuggingFace datasets package: load_dataset("allenai/qasper", split=...).

This script uses a local BM25-style retriever so the metric isolates chunking
strategy instead of depending on an embedding provider.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass
class Chunk:
    doc_id: str
    chunk_id: str
    text: str
    strategy: str


@dataclass
class QueryCase:
    query_id: str
    doc_id: str
    question: str
    evidence: list[str]


STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "does", "what", "when", "which",
    "how", "into", "from", "their", "there", "where", "were", "have", "has",
    "are", "was", "will", "can", "could", "would", "should", "about", "using",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Local QASPER JSON/JSONL file. Optional if datasets is installed.")
    parser.add_argument("--split", default="validation", help="HuggingFace split: train/validation/test")
    parser.add_argument("--limit-questions", type=int, default=300)
    parser.add_argument("--fixed-size", type=int, default=1200, help="Fixed chunk size in characters")
    parser.add_argument("--fixed-overlap", type=int, default=150)
    parser.add_argument("--semantic-max-size", type=int, default=1400)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--evidence-overlap", type=float, default=0.6)
    parser.add_argument("--output", default="evaluation/outputs/qasper-chunk-recall.json")
    parser.add_argument("--report", default="evaluation/outputs/qasper-chunk-recall.md")
    args = parser.parse_args()

    raw_rows = load_qasper(args.input, args.split)
    docs, cases = normalize_qasper(raw_rows, args.limit_questions)
    if not cases:
        raise SystemExit("No QASPER cases with evidence were found.")

    fixed_chunks: list[Chunk] = []
    semantic_chunks: list[Chunk] = []
    for doc_id, doc in docs.items():
        fixed_chunks.extend(fixed_length_chunks(doc_id, doc["text"], args.fixed_size, args.fixed_overlap))
        semantic_chunks.extend(semantic_boundary_chunks(doc_id, doc["sections"], args.semantic_max_size))

    fixed_result = evaluate(cases, fixed_chunks, args.top_k, args.evidence_overlap)
    semantic_result = evaluate(cases, semantic_chunks, args.top_k, args.evidence_overlap)

    output = {
        "dataset": "QASPER",
        "split": args.split,
        "documents": len(docs),
        "questionsWithEvidence": len(cases),
        "topK": args.top_k,
        "fixedChunk": {
            "chunkSizeChars": args.fixed_size,
            "overlapChars": args.fixed_overlap,
            "chunkCount": len(fixed_chunks),
            **fixed_result,
        },
        "semanticChunk": {
            "maxChunkSizeChars": args.semantic_max_size,
            "chunkCount": len(semantic_chunks),
            **semantic_result,
        },
        "absoluteGain": percent_value(semantic_result["recall"] - fixed_result["recall"]),
        "relativeGain": percent_value(
            (semantic_result["recall"] - fixed_result["recall"]) / max(0.0001, fixed_result["recall"])
        ),
    }

    out_path = Path(args.output)
    report_path = Path(args.report)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path.write_text(render_report(output), encoding="utf-8")

    print(f"QASPER Evidence Recall@{args.top_k}")
    print(f"Fixed chunk:    {output['fixedChunk']['recallPercent']}")
    print(f"Semantic chunk: {output['semanticChunk']['recallPercent']}")
    print(f"Absolute gain:  {output['absoluteGain']}")
    print(f"Wrote {out_path}")
    print(f"Wrote {report_path}")


def load_qasper(input_path: str | None, split: str) -> list[dict[str, Any]]:
    if input_path:
        return read_local_rows(Path(input_path))

    try:
        from datasets import load_dataset  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "Install HuggingFace datasets or pass --input:\n"
            "  pip install datasets\n"
            "  python evaluation/qasper_chunk_recall.py --split validation\n"
            "or:\n"
            "  python evaluation/qasper_chunk_recall.py --input path/to/qasper.jsonl"
        ) from exc

    dataset = load_dataset("allenai/qasper", split=split)
    return [dict(row) for row in dataset]


def read_local_rows(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".jsonl":
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    data = json.loads(text)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("data", "validation", "train", "test"):
            if isinstance(data.get(key), list):
                return data[key]
    raise ValueError(f"Unsupported QASPER format: {path}")


def normalize_qasper(rows: list[dict[str, Any]], limit_questions: int) -> tuple[dict[str, Any], list[QueryCase]]:
    docs: dict[str, Any] = {}
    cases: list[QueryCase] = []

    for row in rows:
        doc_id = str(row.get("id") or row.get("paper_id") or row.get("title") or len(docs))
        sections = extract_sections(row)
        if not sections:
            continue

        docs[doc_id] = {
            "title": row.get("title") or "",
            "sections": sections,
            "text": "\n\n".join(
                [row.get("title") or ""]
                + [section["title"] + "\n" + "\n".join(section["paragraphs"]) for section in sections]
            ),
        }

        for qa in extract_qas(row):
            question = str(qa.get("question") or "").strip()
            if not question:
                continue
            evidence = extract_evidence(qa)
            if not evidence:
                continue
            cases.append(
                QueryCase(
                    query_id=str(qa.get("question_id") or qa.get("id") or f"q{len(cases)+1}"),
                    doc_id=doc_id,
                    question=question,
                    evidence=evidence,
                )
            )
            if len(cases) >= limit_questions:
                return docs, cases

    return docs, cases


def extract_sections(row: dict[str, Any]) -> list[dict[str, Any]]:
    full_text = row.get("full_text") or row.get("fullText") or {}
    sections: list[dict[str, Any]] = []

    if isinstance(full_text, dict):
        section_names = full_text.get("section_name") or full_text.get("section_names") or []
        paragraphs = full_text.get("paragraphs") or []
        if isinstance(section_names, list) and isinstance(paragraphs, list):
            for i, paras in enumerate(paragraphs):
                title = str(section_names[i] if i < len(section_names) else f"Section {i+1}")
                normalized_paras = normalize_paragraphs(paras)
                if normalized_paras:
                    sections.append({"title": title, "paragraphs": normalized_paras})

    if not sections:
        abstract = row.get("abstract")
        if abstract:
            sections.append({"title": "Abstract", "paragraphs": normalize_paragraphs(abstract)})

    return sections


def normalize_paragraphs(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                result.append(item.strip())
            elif isinstance(item, list):
                result.extend(normalize_paragraphs(item))
            elif isinstance(item, dict):
                text = item.get("text") or item.get("paragraph") or item.get("content")
                if isinstance(text, str) and text.strip():
                    result.append(text.strip())
        return result
    return []


def extract_qas(row: dict[str, Any]) -> list[dict[str, Any]]:
    qas = row.get("qas") or row.get("qa_pairs") or row.get("questions") or []
    if isinstance(qas, dict):
        return [qas]
    return qas if isinstance(qas, list) else []


def extract_evidence(qa: dict[str, Any]) -> list[str]:
    evidence: list[str] = []
    answers = qa.get("answers") or []
    if isinstance(answers, dict):
        answers = [answers]

    for answer_item in answers if isinstance(answers, list) else []:
        answer = answer_item.get("answer", answer_item) if isinstance(answer_item, dict) else {}
        values = []
        if isinstance(answer, dict):
            values.extend(answer.get("evidence") or [])
        if isinstance(answer_item, dict):
            values.extend(answer_item.get("evidence") or [])
        for value in values:
            if isinstance(value, str) and value.strip():
                evidence.append(value.strip())

    return list(dict.fromkeys(evidence))


def fixed_length_chunks(doc_id: str, text: str, size: int, overlap: int) -> list[Chunk]:
    chunks: list[Chunk] = []
    start = 0
    idx = 0
    while start < len(text):
        end = min(len(text), start + size)
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append(Chunk(doc_id, f"{doc_id}:fixed:{idx}", chunk_text, "fixed"))
            idx += 1
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


def semantic_boundary_chunks(doc_id: str, sections: list[dict[str, Any]], max_size: int) -> list[Chunk]:
    chunks: list[Chunk] = []
    idx = 0
    for section in sections:
        title = section["title"]
        current: list[str] = []
        current_len = 0
        for paragraph in section["paragraphs"]:
            blocks = split_special_blocks(paragraph, max_size)
            for block in blocks:
                block_text = f"{title}\n{block}".strip()
                if current and current_len + len(block_text) > max_size:
                    chunks.append(Chunk(doc_id, f"{doc_id}:semantic:{idx}", "\n\n".join(current), "semantic"))
                    idx += 1
                    current = []
                    current_len = 0

                if len(block_text) > max_size:
                    for sentence_group in sentence_chunks(title, block, max_size):
                        chunks.append(Chunk(doc_id, f"{doc_id}:semantic:{idx}", sentence_group, "semantic"))
                        idx += 1
                else:
                    current.append(block_text)
                    current_len += len(block_text)

        if current:
            chunks.append(Chunk(doc_id, f"{doc_id}:semantic:{idx}", "\n\n".join(current), "semantic"))
            idx += 1
    return chunks


def split_special_blocks(text: str, max_size: int) -> list[str]:
    if looks_like_table(text) and len(text) <= max_size * 1.5:
        return [text]
    if "```" in text:
        return [part.strip() for part in re.split(r"(```[\s\S]*?```)", text) if part.strip()]
    return [text]


def looks_like_table(text: str) -> bool:
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    pipe_lines = sum(1 for line in lines if "|" in line)
    return pipe_lines >= 2


def sentence_chunks(title: str, text: str, max_size: int) -> list[str]:
    sentences = re.split(r"(?<=[.!?。！？])\s+", text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = len(title) + 1
    for sentence in sentences:
        if current and current_len + len(sentence) > max_size:
            chunks.append(f"{title}\n{' '.join(current)}")
            current = []
            current_len = len(title) + 1
        current.append(sentence)
        current_len += len(sentence) + 1
    if current:
        chunks.append(f"{title}\n{' '.join(current)}")
    return chunks


def evaluate(cases: list[QueryCase], chunks: list[Chunk], top_k: int, evidence_overlap: float) -> dict[str, Any]:
    by_doc: dict[str, list[Chunk]] = defaultdict(list)
    for chunk in chunks:
        by_doc[chunk.doc_id].append(chunk)

    hits = 0
    reciprocal_ranks: list[float] = []
    details: list[dict[str, Any]] = []

    for case in cases:
        candidates = by_doc.get(case.doc_id, [])
        ranked = bm25(case.question, candidates)[:top_k]
        hit_rank = None
        for rank, chunk in enumerate(ranked, start=1):
            if chunk_hits_evidence(chunk.text, case.evidence, evidence_overlap):
                hit_rank = rank
                break
        if hit_rank is not None:
            hits += 1
            reciprocal_ranks.append(1 / hit_rank)
        else:
            reciprocal_ranks.append(0)
        details.append(
            {
                "queryId": case.query_id,
                "hit": hit_rank is not None,
                "hitRank": hit_rank,
                "topChunkIds": [chunk.chunk_id for chunk in ranked],
            }
        )

    recall = hits / len(cases)
    return {
        "hits": hits,
        "total": len(cases),
        "recall": recall,
        "recallPercent": percent_value(recall),
        "mrr": round(statistics.mean(reciprocal_ranks), 4),
        "details": details,
    }


def bm25(query: str, chunks: list[Chunk]) -> list[Chunk]:
    query_terms = tokenize(query)
    if not query_terms:
        return chunks[:]

    tokenized = [tokenize(chunk.text) for chunk in chunks]
    doc_freq: Counter[str] = Counter()
    for tokens in tokenized:
        for term in set(tokens):
            doc_freq[term] += 1

    avg_len = sum(len(tokens) for tokens in tokenized) / max(1, len(tokenized))
    k1 = 1.5
    b = 0.75
    scores: list[tuple[float, Chunk]] = []

    for chunk, tokens in zip(chunks, tokenized):
        tf = Counter(tokens)
        score = 0.0
        for term in query_terms:
            if tf[term] == 0:
                continue
            idf = math.log(1 + (len(chunks) - doc_freq[term] + 0.5) / (doc_freq[term] + 0.5))
            denom = tf[term] + k1 * (1 - b + b * len(tokens) / max(1, avg_len))
            score += idf * tf[term] * (k1 + 1) / denom
        scores.append((score, chunk))

    return [chunk for _, chunk in sorted(scores, key=lambda item: item[0], reverse=True)]


def chunk_hits_evidence(chunk_text: str, evidence_items: list[str], threshold: float) -> bool:
    chunk_norm = normalize_text(chunk_text)
    chunk_tokens = set(tokenize(chunk_text))
    for evidence in evidence_items:
        evidence_norm = normalize_text(evidence)
        if len(evidence_norm) >= 30 and evidence_norm in chunk_norm:
            return True
        evidence_tokens = set(tokenize(evidence))
        if evidence_tokens:
            overlap = len(evidence_tokens & chunk_tokens) / len(evidence_tokens)
            if overlap >= threshold:
                return True
    return False


def tokenize(text: str) -> list[str]:
    return [
        token for token in re.sub(r"[^A-Za-z0-9]+", " ", text.lower()).split()
        if len(token) > 1 and token not in STOPWORDS
    ]


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def percent_value(value: float) -> str:
    return f"{value * 100:.2f}%"


def render_report(output: dict[str, Any]) -> str:
    top_k = output["topK"]
    return f"""# QASPER Chunking Evaluation

Dataset: QASPER `{output["split"]}` split

## Setup

- Documents: {output["documents"]}
- Questions with evidence: {output["questionsWithEvidence"]}
- Metric: Evidence Recall@{top_k}
- Fixed chunk: {output["fixedChunk"]["chunkSizeChars"]} chars, {output["fixedChunk"]["overlapChars"]} overlap
- Semantic chunk: section / paragraph / sentence / table / code boundary, max {output["semanticChunk"]["maxChunkSizeChars"]} chars

## Result

| Strategy | Chunks | Hits | Recall@{top_k} | MRR |
|---|---:|---:|---:|---:|
| Fixed length | {output["fixedChunk"]["chunkCount"]} | {output["fixedChunk"]["hits"]}/{output["fixedChunk"]["total"]} | {output["fixedChunk"]["recallPercent"]} | {output["fixedChunk"]["mrr"]} |
| Semantic boundary | {output["semanticChunk"]["chunkCount"]} | {output["semanticChunk"]["hits"]}/{output["semanticChunk"]["total"]} | {output["semanticChunk"]["recallPercent"]} | {output["semanticChunk"]["mrr"]} |

Absolute gain: {output["absoluteGain"]}

Relative gain: {output["relativeGain"]}

## Resume Sentence

基于 QASPER 论文问答子集评估，对比固定长度切分，语义边界 chunk 将 Evidence Recall@{top_k} 从 {output["fixedChunk"]["recallPercent"]} 提升至 {output["semanticChunk"]["recallPercent"]}。
"""


if __name__ == "__main__":
    main()
