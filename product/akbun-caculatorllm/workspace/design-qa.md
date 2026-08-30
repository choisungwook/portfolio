# Design QA

## Visual truth

- Source: [selected option 1](design-qa/source-option-1.png)
- Implementation: [Fits state](design-qa/implementation-fit.jpg)
- OOM state: [overflow state](design-qa/implementation-oom.jpg)
- Mobile state: [390 × 844 viewport](design-qa/implementation-mobile.jpg)
- Side-by-side comparison: [source and implementation](design-qa/comparison.jpg)

## Comparison setup

- Desktop viewport: 1280 × 720, DPR 2.
- Browser capture: normalized to 640 × 720 for direct comparison.
- State: 16 GiB GPU, 8,192 context tokens, 8 concurrent requests, FP8 / INT8 model, BF16 / FP16 KV cache.
- Result: 12.71 GiB needed, 3.29 GiB free.

## Findings and fixes

### Pass 1

- P2: The title and formula heading used too much vertical space.
- P2: The jar was less prominent than the selected design.
- Fix: Reduced header and intro height, removed the extra formula headline, tightened controls, and enlarged the jar column.

### Pass 2

- No P0, P1, or P2 findings.
- P3 accepted: The existing product brand header remains above the selected design.
- P3 accepted: Values and labels reflect real calculator output instead of the mock data.

## Interaction checks

- Loaded a public Hugging Face model ID.
- Uploaded a local `config.json` file.
- Changed model precision and concurrency to move between Fits and OOM.
- Opened and closed Advanced settings.
- Confirmed the OOM liquid overflow animation and label.
- Confirmed no horizontal overflow at 390 px width.
- Confirmed no browser console errors.

final result: passed
