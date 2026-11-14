# Feature map

What a user can see and act on, by the name this wiki uses for it. Use these names in requests and reviews so nobody has to guess which panel is meant. Selectors are from `workspace/index.html`.

| Name | Selector | What it does |
|---|---|---|
| Model lookup | `#model-id`, `#load-model` | Fetches a Hugging Face model config by id and fills the model fields |
| Config upload | `#config-file` | Reads a local `config.json` instead of fetching |
| Load status | `#load-status`, `#error-banner` | Says which model is loaded, or why loading failed |
| GPU size | `#gpu-gib`, `#custom-gpu-gib` | VRAM capacity both jars are drawn against |
| Model format | `#model-format`, `#custom-model-bits` | Bytes per weight |
| Advanced model details | `#model-advanced-settings` | Parameter count override and the model shape read from the config |
| Load result | `#load-jar-stage`, `#load-fit-status` | Jar 01: model weights only, with Needed, Available and Free or Over |
| Workload settings | `#context-tokens`, `#concurrent-requests` | Inputs for the KV cache estimate |
| Advanced workload details | `#workload-advanced-settings` | KV precision (`#kv-bytes`) and extra memory percent (`#alpha-percent`) |
| Workload result | `#workload-jar-stage`, `#workload-fit-status` | Jar 02: weights, KV cache and extra memory stacked, with the OOM label |
| Calculation ledger | `.calculation-ledger` | The formulas with the current numbers substituted |

## Checking the page

The page imports CSS through Vite, so it needs the dev server rather than a static file server.

Start the dev server, then open the page headless and list its console errors and controls:

```bash
npm --prefix product/akbun-caculatorllm/workspace run dev -- --port 5173 &
node .claude/scripts/verify-page.mjs http://localhost:5173 --out /tmp/caculatorllm
```
