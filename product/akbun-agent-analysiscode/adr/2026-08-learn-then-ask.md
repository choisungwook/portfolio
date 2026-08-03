# Explicit learn phase instead of a vector-RAG index

## Decision

Knowledge is built by an explicit `learn` command that runs an agent over each
service checkout and extracts structured facts (APIs, outbound calls, event
topics, evidence paths). Debugging then combines that context with on-demand
file reads. There is no embedding index and no retrieval step.

## Reason

The questions this tool answers are relational — "who calls whom, who listens
to what" — and embedding similarity is the wrong instrument for relations: a
chunk about a payment client and a chunk about a payment handler embed near
each other whether or not one calls the other. Extraction makes the
relationship explicit once, with file:line evidence, and the debug agent can
verify any claim by opening the file. Skipping the vector pipeline also
removes its operational surface (embedding model choice and billing, index
refresh, chunking tuning) — the "RAG setup guide" this product would otherwise
need is reduced to: write a TOML file, run learn. The cost accepted: knowledge
goes stale between learns, so `status` shows `learned_at` and re-learning is
the refresh path.
