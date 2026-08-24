#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
aws_region="us-east-1"
profile="${AWS_PROFILE:-default}"
gateway_name="agentcore-web-search-handson"
credentials="$(aws configure export-credentials \
  --profile "$profile")"
gateway_id="$(aws bedrock-agentcore-control list-gateways \
  --profile "$profile" \
  --region "$aws_region" \
  --output json | jq -r --arg name "$gateway_name" \
  '[.items[]? | select(.name == $name) | .gatewayId][0] // empty')"
if [[ -z "$gateway_id" ]]; then
  echo "AgentCore Gateway를 먼저 생성한다: $gateway_name" >&2
  exit 1
fi
gateway_url="$(aws bedrock-agentcore-control get-gateway \
  --gateway-identifier "$gateway_id" \
  --profile "$profile" \
  --region "$aws_region" \
  --query gatewayUrl \
  --output text)"

jq -r '
  "[runtime]",
  "aws_access_key_id = \(.AccessKeyId)",
  "aws_secret_access_key = \(.SecretAccessKey)",
  "aws_session_token = \(.SessionToken)"
' <<<"$credentials" >"$workspace_dir/.runtime.aws-credentials"

jq -nr --arg gateway_url "$gateway_url" --arg aws_region "$aws_region" '
  "AGENTCORE_GATEWAY_URL=\($gateway_url)",
  "AWS_REGION=\($aws_region)"
' >"$workspace_dir/.runtime.env"

chmod 600 \
  "$workspace_dir/.runtime.aws-credentials" \
  "$workspace_dir/.runtime.env"
