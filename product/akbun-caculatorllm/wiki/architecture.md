# Architecture

One static page, no backend, database, account, or external runtime API. Vite bundles the page and Cloudflare serves the generated assets. Inputs are read and stored only in the browser.

## Modules

| File | Responsibility | Verification |
|---|---|---|
| `src/lib/calculator.js` | Input validation, replica topology, capacity, latency, and KV cache arithmetic | Node unit tests |
| `src/main.js` | DOM reads, formatting, local storage, presets, formula text, and event wiring | Production build and manual interaction |
| `src/styles.css` | Responsive two-panel layout, result hierarchy, utilization states, and mobile breakpoints | Manual viewport check |
| `index.html` | Accessible input and result structure, source links, metadata, and static copy | Production build |

The arithmetic module imports nothing and does not touch the DOM. This keeps the formulas testable without a browser or a deployed site.

## Calculation flow

Every input event follows one path:

1. Read every numeric field.
2. Validate positive values, integer-only topology fields, reserve range, and tensor parallel size.
3. Derive complete replicas as `floor(total GPUs / tensor parallel size)`.
4. Calculate raw and reserve-adjusted prefill and decode capacity.
5. Convert each token budget to requests per second.
6. Use the smaller request budget as sustainable RPS.
7. Derive throughput, target utilization, latency, and KV cache estimates.
8. Render all results and store the input object in `localStorage`.

Invalid input keeps the last rendered values dimmed and shows the first actionable validation error.

## Capacity model

Each request consumes two independent budgets:

```text
safe prefill RPS = prefill tokens/s × replicas × safe factor ÷ prompt tokens/request
safe decode RPS  = decode tokens/s × replicas × safe factor ÷ output tokens/request
maximum RPS      = min(safe prefill RPS, safe decode RPS)
```

The model assumes each replica has the same measured throughput and traffic is distributed evenly. It does not predict throughput from GPU specifications or model parameter count because kernel choice, quantization, context length, batching, and scheduler behavior make that estimate too weak for capacity planning.

Prefill throughput can be derived from a vLLM serving benchmark as total token throughput minus output token throughput. The benchmark must use a workload and concurrency close to production.

## Latency model

The latency section is deliberately an approximation, not a queueing simulator:

```text
TTFT service estimate = prompt tokens ÷ per-replica prefill tokens/s
inter-token latency   = measured decode concurrency ÷ per-replica decode tokens/s
generation time       = (output tokens - 1) × inter-token latency
end-to-end estimate   = TTFT + generation time + user-supplied overhead
```

The first generated token ends TTFT, so generation time uses `output tokens - 1`. The user-supplied overhead can represent queue, load balancer, and network time, but the calculator does not derive it from utilization.

Actual latency changes with continuous batching, token-length variance, queue depth, prefix caching, speculative decoding, and scheduler policy. The UI labels the section as an estimate and exposes these assumptions beside the result.

## KV cache model

The memory estimate uses the ordinary decoder-only attention shape:

```text
bytes/token = 2 × layers × KV heads × head dimension × bytes/element
allocated tokens/request = ceil((prompt + output) ÷ block size) × block size
sequences/replica = floor(KV cache bytes ÷ bytes/request)
```

The leading `2` represents key and value. The calculation does not model runtime metadata, hybrid attention groups, MLA, sliding windows, CPU offload, prefix sharing, or fragmentation beyond token-block rounding. The displayed ceiling is therefore directional and should be checked against vLLM cache metrics.

## Browser state

The current input object is stored under `akbun-caculatorllm.input.v1`. Calculation results are derived again after reload and are not stored. The versioned key allows a future incompatible input schema to start cleanly.

Copy summary writes a plain-text report to the clipboard. No network request carries user input.
