#!/usr/bin/env bash
set -euo pipefail

: "${AGENTCORE_GATEWAY_URL:?AGENTCORE_GATEWAY_URL이 필요하다}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID가 필요하다}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY가 필요하다}"

query="${1:-2026년 8월 Amazon Bedrock의 최신 웹 검색 기능을 한국어로 찾아줘}"
aws_region="${AWS_REGION:-us-east-1}"
auth_args=(
  --aws-sigv4 "aws:amz:${aws_region}:bedrock-agentcore"
  --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}"
)
if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
  auth_args+=(-H "x-amz-security-token: ${AWS_SESSION_TOKEN}")
fi

call_mcp() {
  local payload="$1"
  curl --silent --show-error --fail "${auth_args[@]}" \
    -H "Accept: application/json, text/event-stream" \
    -H "Content-Type: application/json" \
    --data "$payload" \
    "$AGENTCORE_GATEWAY_URL" | sed -n 's/^data: //p; /^{$/,/^}$/p'
}

tools="$(call_mcp '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')"
tool_name="$(jq -r '.result.tools[] | select(.name | endswith("WebSearch")) | .name' <<<"$tools" | head -n 1)"
payload="$(jq -nc --arg name "$tool_name" --arg query "$query" '{
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {name: $name, arguments: {query: $query, maxResults: 5}}
}')"

call_mcp "$payload" | jq .
