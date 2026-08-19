# akbun-caculatorllm

A browser-based LLM serving capacity calculator. Enter a measured vLLM-style workload, deployment shape, prefill throughput, and decode throughput. The page calculates sustainable requests per second, total token throughput, resource utilization, latency estimates, and a standard-attention KV cache ceiling.

The page is a static Vite build deployed to Cloudflare. All input and calculation stay in the browser.

## What it does

| Feature | How it works |
|---|---|
| Workload | Average prompt tokens, output tokens, and target request rate, with chat, RAG, and agent presets |
| Deployment | Total GPUs, tensor parallel size, complete replica count, unused GPUs, and operational reserve |
| Throughput | Separate measured prefill and decode token rates per replica; the smaller request budget becomes the system limit |
| Capacity | Safe RPS, total tokens per second, requests per hour, tokens per GPU, and the replica count needed for an overloaded target |
| Resource load | Prompt and generation utilization at the target request rate, shown separately so the bottleneck remains visible |
| Latency | Approximate TTFT, inter-token latency, generation time, end-to-end time, and per-request output speed |
| KV cache | Standard key/value memory per token, block-rounded request allocation, sequence ceiling, and target pressure |
| Evidence | Expandable arithmetic beside each result and links to primary vLLM benchmark, metric, and deployment documentation |
| Local state | Inputs persist in `localStorage`; Copy summary exports the current result as plain text |

## Directory layout

| Directory | Description |
|---|---|
| `workspace/index.html` | Page structure, inputs, result regions, metadata, and references |
| `workspace/src/main.js` | DOM wiring, persistence, presets, formatting, and result rendering |
| `workspace/src/lib/` | Pure capacity, latency, and KV cache calculations |
| `workspace/src/styles.css` | Responsive visual system for the calculator |
| `workspace/test/` | Arithmetic and validation tests that run on plain Node |
| `workspace/public/` | Static social preview asset |
| `wiki/` | Project notes the next agent reads before changing the product |
| `adr/` | Architecture decision records |

## Quick start

Install dependencies and start the development server:

```bash
cd workspace
npm install
npm run dev
```

Run tests and build the static site:

```bash
npm test
npm run build
```

Deployment is a Cloudflare Pages build on push to master. The setup steps and caveats are in [wiki/development.md](./wiki/development.md).
