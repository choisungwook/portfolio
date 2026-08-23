#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_name="web-search-tool"
gateway_id="$(terraform -chdir="$workspace_dir/terraform" output -raw gateway_id)"
aws_region="$(terraform -chdir="$workspace_dir/terraform" output -raw aws_region)"
target_id="$(aws bedrock-agentcore-control list-gateway-targets \
  --gateway-identifier "$gateway_id" \
  --region "$aws_region" \
  --output json | jq -r --arg name "$target_name" \
  '[.items[]? | select(.name == $name) | .targetId][0] // empty')"

if [[ -z "$target_id" ]]; then
  echo "삭제할 Web Search target 없음: $target_name"
  exit 0
fi

aws bedrock-agentcore-control delete-gateway-target \
  --gateway-identifier "$gateway_id" \
  --target-id "$target_id" \
  --region "$aws_region"

for _ in {1..30}; do
  remaining="$(aws bedrock-agentcore-control list-gateway-targets \
    --gateway-identifier "$gateway_id" \
    --region "$aws_region" \
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
