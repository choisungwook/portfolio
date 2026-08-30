# akbun-caculatorllm

A simple single-GPU VRAM estimator for LLMs. It first checks whether model weights fit, then shows how a workload adds KV cache and extra runtime memory.

The page is a static Vite build deployed to Cloudflare. Uploaded files and calculations stay in the browser. Loading a model ID reads public Hugging Face metadata and `config.json`.

## What it does

| Feature | How it works |
| --- | --- |
| Model input | Loads a public Hugging Face model ID or a local `config.json` |
| Load Model | Compares model weights alone with the selected GPU |
| Run a Workload | Reuses the same model and GPU, then adds KV cache and extra memory |
| Model memory | Uses exact Hugging Face parameter metadata when available, otherwise estimates supported decoder-only shapes from config |
| Weight format | Supports common floating-point, integer, AWQ, GPTQ, NF4, and GGUF sizes plus custom bits |
| KV cache | Calculates key and value memory from layers, KV heads, head dimension, precision, context, and concurrent requests |
| Extra memory | Adds a visible adjustable reserve; the default is 20% of model plus KV memory |
| Result | Shows Needed, Available, and Free or Over for both calculations |
| Visualization | Uses one jar for model loading and another for the workload; OOM spills over the jar |
| Evidence | Shows every formula with the current values substituted |

## Directory layout

| Directory | Description |
| --- | --- |
| `workspace/index.html` | Accessible inputs, jar result, and formula ledger |
| `workspace/src/main.js` | Hugging Face loading, file upload, rendering, and event wiring |
| `workspace/src/lib/` | Pure model-memory and KV-cache calculations |
| `workspace/src/styles.css` | Responsive visual system and OOM animation |
| `workspace/test/` | Calculation and config parsing tests |
| `workspace/public/` | Static page assets |
| `wiki/` | Architecture and development notes |
| `adr/` | Architecture decision records |
| `knowledge/` | Durable product decisions and domain knowledge |

## Quick start

```bash
cd workspace
npm install
npm run dev
```

```bash
npm test
npm run build
```

Deployment details are in [wiki/development.md](./wiki/development.md).
