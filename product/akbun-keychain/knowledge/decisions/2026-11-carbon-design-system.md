---
type: Decision
title: The page follows IBM Carbon through the token contract akbun-taskq already has
description: Carbon tokens and rules are copied from akbun-taskq; the Carbon packages are not added.
tags: [ui, design-system]
generated: { by: claude-code, at: 2026-11-17T00:00:00Z }
---

## 결정

The page served by `gui` follows IBM Carbon Design System (g10 light, g100 dark). It reuses the token contract and the Carbon theme file of akbun-taskq and the test that keeps component CSS on contract tokens. The `@carbon/*` packages are not installed.

## 이유

- The owner asked for Carbon. It is also what [akbun-taskq chose](../../../akbun-taskq/knowledge/decisions/2026-11-carbon-design-system.md), so two local pages opened by the same person look and behave alike.
- The page has no build step, and Carbon's components ship as web components or React. Installing them would add a bundler or several hundred KB to a binary whose page is one list and one form.
- Carbon's rules fit what this page does: a danger button with a second step for delete, a notification that stays until read for a failed save, and status shown with a symbol and a word for locked and unlocked.
- Cost: Carbon updates do not arrive by a version bump; the theme file is edited by hand.
