#!/usr/bin/env bash
set -euo pipefail

aws_region="us-east-1"
aws_profile="${AWS_PROFILE:-default}"
gateway_name="agentcore-web-search-handson"
target_name="web-search-tool"

aws_cli() {
  aws "$@" --profile "$aws_profile" --region "$aws_region"
}

gateway_id="$(aws_cli bedrock-agentcore-control list-gateways --output json |
  jq -r --arg name "$gateway_name" \
    '[.items[]? | select(.name == $name) | .gatewayId][0] // empty')"
if [[ -z "$gateway_id" ]]; then
  echo "삭제할 AgentCore Gateway 없음: $gateway_name"
  exit 0
fi
target_id="$(aws_cli bedrock-agentcore-control list-gateway-targets \
  --gateway-identifier "$gateway_id" \
  --output json | jq -r --arg name "$target_name" \
  '[.items[]? | select(.name == $name) | .targetId][0] // empty')"

if [[ -z "$target_id" ]]; then
  echo "삭제할 Web Search target 없음: $target_name"
  exit 0
fi

aws_cli bedrock-agentcore-control delete-gateway-target \
  --gateway-identifier "$gateway_id" \
  --target-id "$target_id"

for _ in {1..30}; do
  remaining="$(aws_cli bedrock-agentcore-control list-gateway-targets \
    --gateway-identifier "$gateway_id" \
    --output json | jq -r --arg id "$target_id" \
    '[.items[]? | select(.targetId == $id)] | length')"
  if [[ "$remaining" == "0" ]]; then
    echo "Web Search target 삭제 완료: $target_name"
    exit 0
  fi
  sleep 2
done

echo "Web Search target 삭제 시간 초과" >&2
exit 1
