# Design QA

## Visual truth

- Source: [two-stage revision request](design-qa/source-two-stage-request.png)
- Desktop: [model information](design-qa/implementation-desktop.jpg)
- Load Model: [model-only result](design-qa/implementation-load.jpg)
- Workload jar: [layered workload memory](design-qa/implementation-workload-jar.jpg)
- Workload OOM: [fixed OOM result](design-qa/implementation-oom.jpg)
- Mobile: [top](design-qa/implementation-mobile.jpg), [OOM](design-qa/implementation-mobile-oom.jpg), [formulas](design-qa/implementation-mobile-formulas.jpg)
- Comparison input: [source, workload jar, and OOM result](design-qa/comparison-two-stage.jpg)

## Comparison setup

- Desktop viewport: 1280 × 720.
- Mobile viewport: 390 × 844.
- State: Qwen2.5-7B, BF16, 16 GiB GPU, 8,192 context tokens, one request, BF16 KV cache, 20% extra memory.
- Load Model: 14.2 GiB needed, 1.8 GiB free.
- Run a Workload: 17.5 GiB needed, 1.5 GiB over.
- The source screenshot is the previous broken OOM state. It is used for visual language and defect comparison; the requested vertical two-stage structure is an intentional layout change.

## Findings and fixes

### Pass 1

- P1: The OOM heading wrapped into oversized single words and broke the result column.
- P1: One jar combined model loading and workload memory, hiding that model loading can fail first.
- P2: GPU capacity and Needed, Available, and Free or Over were easy to miss.
- P2: The precision list omitted common serving and quantized formats.
- P2: The desktop layout did not translate safely to a narrow viewport.
- Fix: Added fixed-width vertical result panels, separate Load Model and Run a Workload jars, stronger capacity and result metrics, expanded weight formats, and stacked mobile rules.

### Pass 2

- Typography: headings remain readable without isolated word wrapping on desktop or mobile.
- Spacing: each section has a clear boundary and one vertical reading path.
- Colors: lime identifies memory that fits; red is reserved for OOM and Over.
- Image quality: the jar asset stays sharp and is not stretched at either viewport.
- Copy: labels use short English phrases and distinguish model loading from workload execution.
- No P0, P1, or P2 findings remain.

## Interaction checks

- Loaded a public Hugging Face model ID and detected BF16 from `config.json`.
- Confirmed local `config.json` parsing remains covered by unit tests.
- Changed FP32, INT4, and custom-bit formats and confirmed both results update.
- Opened and closed both Advanced sections.
- Confirmed default Load Model Fits while Run a Workload is Out of memory.
- Confirmed no horizontal overflow at 390 px width.
- Confirmed a clean page load has no browser console errors.

final result: passed
