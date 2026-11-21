---
type: Decision
title: Indexer defaults to Claude Haiku at low effort
description: The model that will summarise raw observations defaults to claude-haiku-5-5 with low effort; OpenAI is the other expected provider.
tags: [indexer, config]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T00:00:00Z }
---

## Decision

`indexer` in the config defaults to `{ provider: "claude", model: "claude-haiku-5-5", effort: "low" }`. `provider: "none"` keeps raw observations only. The summariser itself is not implemented in 0.1.0.

## Reason

Summaries run in the background on every session, so cost and latency matter more than depth, and the expected users run Haiku or a small OpenAI model. Search works without the indexer, so turning it off never breaks retrieval.
