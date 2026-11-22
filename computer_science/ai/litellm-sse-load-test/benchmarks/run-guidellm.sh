#!/usr/bin/env bash
set -euo pipefail

# LiteLLM Proxy(OpenAI 호환)를 대상으로 GuideLLM 동시성 벤치마크를 실행한다.
# LiteLLM의 모델 별칭(local-qwen)은 HuggingFace ID가 아니므로 실제 모델의 토크나이저를 명시한다.

mkdir -p benchmarks/output/guidellm

uvx --from guidellm guidellm run \
  --backend kind=openai_http,target=http://localhost:4000,model=local-qwen,api_key=sk-local-litellm-test \
  --tokenizer kind=huggingface_auto,model=Qwen/Qwen2.5-1.5B-Instruct \
  --profile kind=concurrent,streams=2 \
  --constraint kind=max_requests,count=10 \
  --data kind=synthetic_text,prompt_tokens=128,output_tokens=64 \
  --disable-progress \
  --output kind=console \
  --output kind=html,path=benchmarks/output/guidellm/concurrent-2.html
