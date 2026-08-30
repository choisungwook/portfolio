# Architecture

One static page, no backend, database, or account. Vite bundles the page and Cloudflare serves the generated assets. Local `config.json` files and calculations stay in the browser. A model ID triggers read-only requests to public Hugging Face endpoints.

## Modules

| File | Responsibility | Verification |
| --- | --- | --- |
| `src/lib/calculator.js` | Config normalization, parameter estimation, input validation, and VRAM arithmetic | Node unit tests |
| `src/main.js` | Hugging Face loading, file upload, formatting, jar layers, formulas, and events | Browser interaction and production build |
| `src/styles.css` | Responsive layout, layered liquids, and OOM overflow animation | Browser viewport checks |
| `index.html` | Accessible inputs, result structure, formulas, and metadata | Production build |

The arithmetic module imports nothing and does not touch the DOM.

## Calculation flow

1. Load exact Hugging Face parameter metadata when a model ID is available.
2. Normalize the model shape from `config.json`.
3. Estimate parameters only for supported decoder-only shapes when exact metadata is absent.
4. Read GPU, context, concurrency, precision, and extra-memory inputs.
5. Calculate model weights, KV cache, extra memory, and total needed VRAM.
6. Compare the total with one GPU.
7. Render Fits or Out of memory, liquid layers, and substituted formulas.

Unsupported model shapes require a manual parameter count. The calculator does not silently invent one.

## Model memory

```text
model GiB = parameter count × model bytes/parameter ÷ 1,073,741,824
```

Model precision is editable because config metadata does not always describe the serving-time quantization.

## KV cache

```text
KV bytes/token = 2 × layers × KV heads × head dimension × KV bytes/element
KV GiB = KV bytes/token × max context × concurrent requests ÷ 1,073,741,824
```

The leading `2` represents key and value. The estimate assumes ordinary decoder-only attention and a fully allocated maximum context for every concurrent request.

## Extra memory and result

```text
extra GiB = (model GiB + KV GiB) × extra percent
total GiB = model GiB + KV GiB + extra GiB
fits = total GiB <= GPU GiB
```

The default extra-memory value is 20%. It is an adjustable planning reserve for activations, workspaces, runtime allocations, and fragmentation, not an exact runtime measurement.

## Trust limits

- Single GPU only; no tensor parallel or multi-GPU partitioning.
- No CPU or disk offload.
- No prefix sharing, sliding-window reduction, MLA compression, or paged-cache fragmentation model.
- Exact Hugging Face parameter totals are preferred over config-derived estimates.
- Real runtime allocation remains the final check.
