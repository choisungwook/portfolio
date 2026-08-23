#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$workspace_dir/.env"

query="${1:-2026년 8월 Amazon Bedrock의 최신 웹 검색 기능을 검색해줘}"
max_results="${2:-5}"
payload="$(jq -nc --arg query "$query" --argjson max_results "$max_results" '{
  query: $query,
  search_tool_name: "agentcore-search",
  max_results: $max_results
}')"

curl --silent --show-error --fail "http://localhost:${LITELLM_PORT:-4001}/search" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data "$payload" | jq .
