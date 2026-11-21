---
type: Decision
title: Model-free hybrid search with a replaceable tokenizer
description: BM25 plus hashed term vectors fused by RRF, tokenized by a builtin script splitter or an external open-source tokenizer.
tags: [search, tokenizer, vector]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T00:00:00Z }
---

## Decision

Search needs no AI model. Each memory is tokenized once; the tokens feed an FTS5 index (BM25) and a 512-dimension FNV-hashed term vector. Results are fused with reciprocal rank fusion and weighted by a recency half-life. The builtin tokenizer splits CJK into character bigrams and keeps Korean words plus bigrams. The `command` tokenizer runs any open-source tokenizer as a child process, for example a SentencePiece model such as Google's Gemma 3 tokenizer (262k vocabulary, strong on Korean, Japanese and Chinese) or Microsoft's BlingFire with an XLM-RoBERTa model.

## Reason

Some environments forbid AI models, so the floor must be deterministic code. A subword tokenizer from a large multilingual vocabulary improves CJK matching, but bundling one would add a native dependency, so it is an adapter instead of the default. Hashed vectors are lexical rather than semantic; they still rescue partial matches that BM25 misses, and RRF lets an embedding model join later as a third ranking without changing the fusion. The tokenizer id is stored in `meta` because vectors from different tokenizers are not comparable.
