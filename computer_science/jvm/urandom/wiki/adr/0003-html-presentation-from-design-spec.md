---
type: Decision
title: Build the presentation as self-contained HTML
description: Implement the akbun-presentation external-talk style as a single HTML file instead of a pptxgenjs-generated .pptx.
tags: [presentation, workflow]
timestamp: 2026-07-20T00:00:00Z
---

## Decision

Build the deck as one self-contained `presentation/index.html` (keyboard/click navigation, 1280x720 stage) that implements the akbun-presentation external-talk mode — light-sandwich structure, `#212022`/`#FFC000` color grammar, section covers with the yellow bar, VS Code-style code panels, page numbers — directly from the skill's `design.md` spec.

## Reason

- HTML output was explicitly requested, and `design.md` declares itself a tool-independent style spec, so implementing it outside pptxgenjs is a supported use of the skill.
- A single HTML file renders in any browser from the repository without PowerPoint, fits git review as text, and can be QA'd headlessly (Chromium screenshots verified no clipping or overlap).
- Trade-off: the deck cannot be edited in PowerPoint/Google Slides. Accepted because the file is the publishing format here, not an editing intermediate; regenerating from HTML is straightforward if a .pptx is needed later.
