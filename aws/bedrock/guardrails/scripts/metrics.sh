#!/usr/bin/env bash
# 최근 N시간(기본 3) 동안 이 guardrail의 CloudWatch 메트릭 합계를 버전별, 정책별로 출력한다.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .runtime.env; set +a
hours=${1:-3}
end=$(date -u +%FT%TZ)
start=$(python3 -c "import datetime as d;print((d.datetime.now(d.timezone.utc)-d.timedelta(hours=$hours)).strftime('%FT%TZ'))")

sum() { # sum <metric> <stat> <dimensions...>
  aws cloudwatch get-metric-statistics --region "$AWS_REGION" --namespace AWS/Bedrock/Guardrails \
    --metric-name "$1" --statistics "$2" --period $((hours * 3600)) \
    --start-time "$start" --end-time "$end" --dimensions "${@:3}" \
    --query "Datapoints[0].$2" --output text
}

echo "| 버전 | Invocations | InvocationsIntervened | TextUnitCount | 평균 InvocationLatency(ms) |"
echo "|---|---|---|---|---|"
for v in 1 2 DRAFT; do
  d=(Name=GuardrailArn,Value="$GUARDRAIL_ARN" Name=GuardrailVersion,Value="$v")
  echo "| $v | $(sum Invocations Sum "${d[@]}") | $(sum InvocationsIntervened Sum "${d[@]}") | $(sum TextUnitCount Sum "${d[@]}") | $(sum InvocationLatency Average "${d[@]}") |"
done

echo
echo "| 방향 | 정책(계정 전체) | TextUnitCount | InvocationsIntervened |"
echo "|---|---|---|---|"
for src in Input Output; do
for p in ContentPolicy TopicPolicy WordPolicy SensitiveInformationPolicy ContextualGroundingPolicy; do
  d=(Name=Operation,Value=ApplyGuardrail Name=GuardrailContentSource,Value=$src Name=GuardrailPolicyType,Value="$p")
  echo "| $src | $p | $(sum TextUnitCount Sum "${d[@]}") | $(sum InvocationsIntervened Sum "${d[@]}") |"
done
done
