#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
aws_region="us-east-1"
aws_profile="${AWS_PROFILE:-default}"
project_name="agentcore-web-search-handson"
role_name="${project_name}-gateway"
role_policy_name="web-search-connector"
delivery_source_name="${project_name}-application-logs"
delivery_destination_name="${project_name}-cloudwatch"

aws_cli() {
  aws "$@" --profile "$aws_profile" --region "$aws_region"
}

gateway_id="$(aws_cli bedrock-agentcore-control list-gateways --output json |
  jq -r --arg name "$project_name" \
    '[.items[]? | select(.name == $name) | .gatewayId][0] // empty')"
if [[ -z "$gateway_id" ]]; then
  echo "삭제할 AgentCore Gateway 없음: $project_name"
else
  AWS_PROFILE="$aws_profile" "$workspace_dir/scripts/delete-web-search-target.sh"

  delivery_ids="$(aws_cli logs describe-deliveries --output json |
    jq -r --arg source "$delivery_source_name" \
      '.deliveries[]? | select(.deliverySourceName == $source) | .id')"
  while IFS= read -r delivery_id; do
    [[ -z "$delivery_id" ]] && continue
    aws_cli logs delete-delivery --id "$delivery_id"
  done <<<"$delivery_ids"

  if aws_cli logs describe-delivery-sources --output json |
    jq -e --arg name "$delivery_source_name" \
      '.deliverySources[]? | select(.name == $name)' >/dev/null; then
    aws_cli logs delete-delivery-source --name "$delivery_source_name"
  fi
  if aws_cli logs describe-delivery-destinations --output json |
    jq -e --arg name "$delivery_destination_name" \
      '.deliveryDestinations[]? | select(.name == $name)' >/dev/null; then
    aws_cli logs delete-delivery-destination --name "$delivery_destination_name"
  fi

  log_group_name="/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/${gateway_id}"
  if aws_cli logs describe-log-groups \
    --log-group-name-prefix "$log_group_name" \
    --query "logGroups[?logGroupName=='${log_group_name}'].logGroupName | [0]" \
    --output text | grep -qx "$log_group_name"; then
    aws_cli logs delete-log-group --log-group-name "$log_group_name"
  fi

  aws_cli bedrock-agentcore-control delete-gateway \
    --gateway-identifier "$gateway_id"
  for _ in {1..60}; do
    remaining="$(aws_cli bedrock-agentcore-control list-gateways --output json |
      jq -r --arg id "$gateway_id" \
        '[.items[]? | select(.gatewayId == $id)] | length')"
    [[ "$remaining" == "0" ]] && break
    sleep 2
  done
  [[ "$remaining" == "0" ]] || {
    echo "AgentCore Gateway 삭제 시간 초과" >&2
    exit 1
  }
fi

if aws_cli iam get-role --role-name "$role_name" >/dev/null 2>&1; then
  aws_cli iam delete-role-policy \
    --role-name "$role_name" \
    --policy-name "$role_policy_name"
  aws_cli iam delete-role --role-name "$role_name"
fi

echo "AgentCore Web Search 리소스 삭제 완료"
