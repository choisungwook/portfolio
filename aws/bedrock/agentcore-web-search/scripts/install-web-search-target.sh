#!/usr/bin/env bash
set -euo pipefail

aws_region="us-east-1"
aws_profile="${AWS_PROFILE:-default}"
gateway_name="agentcore-web-search-handson"
target_name="web-search-tool"
connector_version="${WEB_SEARCH_CONNECTOR_VERSION:-1.2.0}"
included_domains="${WEB_SEARCH_INCLUDED_DOMAINS_JSON:-[]}"
excluded_domains="${WEB_SEARCH_EXCLUDED_DOMAINS_JSON:-[]}"

aws_cli() {
  aws "$@" --profile "$aws_profile" --region "$aws_region"
}

if ! aws_cli bedrock-agentcore-control create-gateway-target --generate-cli-skeleton input \
  2>/dev/null | jq -e '.targetConfiguration.mcp.connector' >/dev/null; then
  echo "AWS CLI 2.36.3 이상이 필요하다. 현재 버전: $(aws --version 2>&1)" >&2
  exit 1
fi

validate_domains() {
  local variable_name="$1"
  local domains="$2"
  if ! jq -e 'type == "array" and length <= 100 and all(.[]; type == "string")' \
    <<<"$domains" >/dev/null 2>&1; then
    echo "$variable_name는 문자열 배열 JSON이며 최대 100개여야 한다." >&2
    exit 1
  fi
}

validate_domains "WEB_SEARCH_INCLUDED_DOMAINS_JSON" "$included_domains"
validate_domains "WEB_SEARCH_EXCLUDED_DOMAINS_JSON" "$excluded_domains"

gateway_id="$(aws_cli bedrock-agentcore-control list-gateways --output json |
  jq -r --arg name "$gateway_name" \
    '[.items[]? | select(.name == $name) | .gatewayId][0] // empty')"
if [[ -z "$gateway_id" ]]; then
  echo "AgentCore Gateway를 먼저 생성한다: $gateway_name" >&2
  exit 1
fi
domain_filter="$(jq -nc \
  --argjson include "$included_domains" \
  --argjson exclude "$excluded_domains" \
  '({}
    + (if ($include | length) > 0 then {include: $include} else {} end)
    + (if ($exclude | length) > 0 then {exclude: $exclude} else {} end))')"
parameter_values="$(jq -nc --argjson domain_filter "$domain_filter" \
  'if ($domain_filter | length) > 0 then {domainFilter: $domain_filter} else {} end')"
target_configuration="$(jq -nc \
  --arg version "$connector_version" \
  --argjson parameter_values "$parameter_values" \
  '{mcp: {connector: {
    source: {connectorId: "web-search", version: $version},
    configurations: [{name: "WebSearch", parameterValues: $parameter_values}]
  }}}')"
credential_configuration='[{"credentialProviderType":"GATEWAY_IAM_ROLE"}]'
target_id="$(aws_cli bedrock-agentcore-control list-gateway-targets \
  --gateway-identifier "$gateway_id" \
  --output json | jq -r --arg name "$target_name" \
  '[.items[]? | select(.name == $name) | .targetId][0] // empty')"

wait_until_ready() {
  local status
  for _ in {1..30}; do
    status="$(aws_cli bedrock-agentcore-control get-gateway-target \
      --gateway-identifier "$gateway_id" \
      --target-id "$target_id" \
      --query status \
      --output text)"
    if [[ "$status" == "READY" ]]; then
      return
    fi
    if [[ "$status" == "FAILED" || "$status" == *"UNSUCCESSFUL" ]]; then
      echo "Web Search target 준비 실패: $status" >&2
      exit 1
    fi
    sleep 2
  done
  echo "Web Search target 준비 시간 초과" >&2
  exit 1
}

if [[ -z "$target_id" ]]; then
  target_id="$(aws_cli bedrock-agentcore-control create-gateway-target \
    --gateway-identifier "$gateway_id" \
    --name "$target_name" \
    --target-configuration "$target_configuration" \
    --credential-provider-configurations "$credential_configuration" \
    --query targetId \
    --output text)"
  wait_until_ready
  echo "Web Search target 생성 완료: $target_name"
  exit 0
fi

aws_cli bedrock-agentcore-control update-gateway-target \
  --gateway-identifier "$gateway_id" \
  --target-id "$target_id" \
  --name "$target_name" \
  --target-configuration "$target_configuration" \
  --credential-provider-configurations "$credential_configuration" \
  >/dev/null
wait_until_ready
echo "Web Search target 갱신 완료: $target_name"
