#!/usr/bin/env bash
set -euo pipefail

# Mooncake Trace(.jsonl) 파일을 GuideLLM으로 리플레이해 타임스탬프·토큰 길이·Prefix 공유 패턴을 재현한다.

uvx --from guidellm guidellm run \
  --backend kind=openai_http,target=http://localhost:4000,model=local-qwen,api_key=sk-local-litellm-test \
  --tokenizer kind=huggingface_auto,model=Qwen/Qwen2.5-1.5B-Instruct \
  --profile kind=replay \
  --constraint kind=max_requests,count=6 \
  --data '{"kind":"mooncake","source":{"kind":"json_file","path":"benchmarks/sample-mooncake-trace.jsonl"}}' \
  --disable-progress \
  --output kind=console
