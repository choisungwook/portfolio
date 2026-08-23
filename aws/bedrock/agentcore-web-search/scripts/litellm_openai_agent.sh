#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$workspace_dir/.env"

query="${1:-2026년 8월 Amazon Bedrock의 최신 웹 검색 기능을 한국어로 설명하고 출처를 표시해줘}"
payload="$(jq -nc --arg query "$query" '{
  model: "openai-search-agent",
  input: $query,
  tools: [{type: "web_search"}],
  stream: false
}')"

curl --silent --show-error --fail "http://localhost:${LITELLM_PORT:-4001}/v1/responses" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data "$payload" | jq .
