---
type: Decision
title: Import and export the storyboard skills' storyboard.json exactly
description: The product reads and writes the skill format losslessly instead of replacing the skills or their pptx output.
tags: [storyboard, interop]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-15T00:00:00Z }
---

## 결정

`project_import` reads the `storyboard.json` and `sketches/cut_NN.png` written by the akbun-youtube-storyboard skills, and `project_export` writes the same shape back. A test asserts that a real skill output survives import and export unchanged. Scene fields keep the skill's names except `desc`, stored as `description`. Fields the skill format lacks (comments, statuses, ideas, track titles, sound effect items) live only in the product and in `project_save` folders.

## 이유

- The skills already produce good storyboards and a pptx that is pleasant to read. Their limit is editing: changing one scene means regenerating the deck. Round-tripping lets the product be the editing surface while the skills keep generating and rendering.
- Exact equality is a cheap, strong check that no field is silently dropped when the skill format grows.
- Sound effect items are not exported because the skill keeps sound effects as strings on each cut; mixing the two would break the round trip.
