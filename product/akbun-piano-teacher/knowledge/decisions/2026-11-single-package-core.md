---
type: Decision
title: One package with a core folder, tested with node:test
description: src/core holds everything that must not import Electron; tests run the .ts sources directly with node --test.
tags: [layout, testing]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
sources:
  - id: intent
    resource: /references/piano-coach-intent-architecture-v0.3.md
    title: Piano Coach intent and architecture v0.3
---

## 결정

`workspace/` is a single npm package. `src/core/` plays the role of `packages/core` from the intent document (model, notation, MusicXML, timeline, analysis, OMR orchestration) and imports nothing from Electron or the DOM runtime. Tests use `node --test` on the TypeScript sources, not vitest.

## 이유

- The intent document's boundary is "core never imports Electron or React". A folder keeps that boundary; a workspace monorepo would add a second package.json, build order and publish step for one consumer.
- Node 24 strips types and runs `.ts` files directly, which is how akbun-taskq and the Electron rule in this repository test. No test framework dependency and no build before tests, so the PR job on ubuntu needs neither a build nor an Electron binary.
- Split into packages when a second app (for example a CLI or a web build) consumes core.
