#!/usr/bin/env bash
set -euo pipefail

# LiteLLM Proxy(OpenAI 호환)를 대상으로 NVIDIA AIPerf 스트리밍 벤치마크를 실행한다.
# --tokenizer builtin 은 오프라인 tiktoken(o200k_base)을 사용해 HuggingFace 다운로드 없이 즉시 실행된다.

uvx --from aiperf aiperf profile \
  --model local-qwen \
  --tokenizer builtin \
  --endpoint-type chat \
  --streaming \
  --url http://localhost:4000 \
  --api-key sk-local-litellm-test \
  --concurrency 2 \
  --warmup-request-count 2 \
  --request-count 10 \
  --isl 128 \
  --osl 64 \
  --ui-type simple \
  --artifact-dir benchmarks/output/aiperf
