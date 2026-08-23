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

gateway_id() {
  aws_cli bedrock-agentcore-control list-gateways --output json |
    jq -r --arg name "$project_name" \
      '[.items[]? | select(.name == $name) | .gatewayId][0] // empty'
}

wait_for_gateway() {
  local id="$1"
  local status
  for _ in {1..60}; do
    status="$(aws_cli bedrock-agentcore-control get-gateway \
      --gateway-identifier "$id" \
      --query status \
      --output text)"
    if [[ "$status" == "READY" ]]; then
      return
    fi
    if [[ "$status" == "FAILED" || "$status" == *"UNSUCCESSFUL" ]]; then
      echo "AgentCore Gateway 준비 실패: $status" >&2
      exit 1
    fi
    sleep 2
  done
  echo "AgentCore Gateway 준비 시간 초과" >&2
  exit 1
}

account_id="$(aws_cli sts get-caller-identity --query Account --output text)"
caller_arn="$(aws_cli sts get-caller-identity --query Arn --output text)"
partition="$(cut -d: -f2 <<<"$caller_arn")"
gateway_arn_pattern="arn:${partition}:bedrock-agentcore:${aws_region}:${account_id}:gateway/*"
web_search_arn="arn:${partition}:bedrock-agentcore:${aws_region}:aws:tool/web-search.v1"

trust_policy="$(jq -nc \
  --arg account_id "$account_id" \
  --arg source_arn "$gateway_arn_pattern" \
  '{Version: "2012-10-17", Statement: [{
    Effect: "Allow",
    Principal: {Service: "bedrock-agentcore.amazonaws.com"},
    Action: "sts:AssumeRole",
    Condition: {
      StringEquals: {"aws:SourceAccount": $account_id},
      ArnLike: {"aws:SourceArn": $source_arn}
    }
  }]}')"
role_policy="$(jq -nc \
  --arg resource "$web_search_arn" \
  '{Version: "2012-10-17", Statement: [{
    Effect: "Allow",
    Action: "bedrock-agentcore:InvokeWebSearch",
    Resource: $resource
  }]}')"

if aws_cli iam get-role --role-name "$role_name" >/dev/null 2>&1; then
  aws_cli iam update-assume-role-policy \
    --role-name "$role_name" \
    --policy-document "$trust_policy"
else
  aws_cli iam create-role \
    --role-name "$role_name" \
    --assume-role-policy-document "$trust_policy" \
    --tags Key=ManagedBy,Value=AWSCLI Key=Project,Value="$project_name" >/dev/null
fi
aws_cli iam put-role-policy \
  --role-name "$role_name" \
  --policy-name "$role_policy_name" \
  --policy-document "$role_policy"

role_arn="$(aws_cli iam get-role \
  --role-name "$role_name" \
  --query Role.Arn \
  --output text)"
gateway_id="$(gateway_id)"
if [[ -z "$gateway_id" ]]; then
  gateway_id="$(aws_cli bedrock-agentcore-control create-gateway \
    --name "$project_name" \
    --description "MCP gateway for the managed AgentCore Web Search connector" \
    --role-arn "$role_arn" \
    --protocol-type MCP \
    --protocol-configuration '{"mcp":{"instructions":"Search the public web and preserve source citations.","searchType":"SEMANTIC","supportedVersions":["2025-03-26","2025-06-18"]}}' \
    --authorizer-type AWS_IAM \
    --tags ManagedBy=AWSCLI,Project="$project_name" \
    --query gatewayId \
    --output text)"
fi
wait_for_gateway "$gateway_id"

AWS_PROFILE="$aws_profile" "$workspace_dir/scripts/install-web-search-target.sh"

gateway_arn="$(aws_cli bedrock-agentcore-control get-gateway \
  --gateway-identifier "$gateway_id" \
  --query gatewayArn \
  --output text)"
log_group_name="/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/${gateway_id}"
log_group_arn="arn:${partition}:logs:${aws_region}:${account_id}:log-group:${log_group_name}"

if ! aws_cli logs describe-log-groups \
  --log-group-name-prefix "$log_group_name" \
  --query "logGroups[?logGroupName=='${log_group_name}'].logGroupName | [0]" \
  --output text | grep -qx "$log_group_name"; then
  aws_cli logs create-log-group \
    --log-group-name "$log_group_name" \
    --tags ManagedBy=AWSCLI,Project="$project_name"
fi
aws_cli logs put-retention-policy \
  --log-group-name "$log_group_name" \
  --retention-in-days 7
aws_cli logs put-delivery-source \
  --name "$delivery_source_name" \
  --resource-arn "$gateway_arn" \
  --log-type APPLICATION_LOGS \
  --tags ManagedBy=AWSCLI,Project="$project_name" >/dev/null
delivery_destination_arn="$(aws_cli logs put-delivery-destination \
  --name "$delivery_destination_name" \
  --output-format json \
  --delivery-destination-configuration destinationResourceArn="$log_group_arn" \
  --tags ManagedBy=AWSCLI,Project="$project_name" \
  --query deliveryDestination.arn \
  --output text)"
delivery_id="$(aws_cli logs describe-deliveries \
  --output json | jq -r \
  --arg source "$delivery_source_name" \
  --arg destination "$delivery_destination_arn" \
  '[.deliveries[]? | select(
    .deliverySourceName == $source and .deliveryDestinationArn == $destination
  ) | .id][0] // empty')"
if [[ -z "$delivery_id" ]]; then
  aws_cli logs create-delivery \
    --delivery-source-name "$delivery_source_name" \
    --delivery-destination-arn "$delivery_destination_arn" >/dev/null
fi

AWS_PROFILE="$aws_profile" "$workspace_dir/scripts/export-runtime-env.sh"
echo "AgentCore Web Search 리소스 생성 완료: $gateway_id"
