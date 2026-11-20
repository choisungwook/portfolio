#!/usr/bin/env bash
set -euo pipefail

# GuideLLM으로 동시성 1 -> 2 -> 4 단계별 스윕을 실행하고 콘솔·HTML·JSON 리포트를 저장한다.

mkdir -p benchmarks/output/guidellm

uvx --from guidellm guidellm run \
  --backend kind=openai_http,target=http://localhost:4000,model=local-qwen,api_key=sk-local-litellm-test \
  --tokenizer kind=huggingface_auto,model=Qwen/Qwen2.5-1.5B-Instruct \
  --profile kind=concurrent \
  --override 'profile.streams' 1,2,4 \
  --constraint kind=max_requests,count=6 \
  --data kind=synthetic_text,prompt_tokens=128,output_tokens=48 \
  --disable-progress \
  --output kind=console \
  --output kind=html,path=benchmarks/output/guidellm/report.html \
  --output kind=json,path=benchmarks/output/guidellm/report.json
