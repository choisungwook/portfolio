#!/usr/bin/env bash
# 사용법: scripts/report-aws.sh [시작 UTC, 기본 3시간 전]
# Bedrock이 센 호출 수와 token을 CloudWatch(AWS/Bedrock)에서 읽는다. 몇 분 안에 보인다.
# 청구 금액은 Cost Explorer에 하루쯤 뒤에 나온다. 맨 아래 명령으로 확인한다(호출당 $0.01).
set -euo pipefail
REGION=${AWS_REGION_NAME:-us-east-1}
MODEL=global.anthropic.claude-sonnet-4-6
START=${1:-$(date -u -v-3H +%Y-%m-%dT%H:%M:%SZ)}
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 지표 이름을 하드코딩하지 않고 이 모델에 실제로 쌓인 것 중 호출 수와 token 지표만 고른다.
METRICS=$(aws cloudwatch list-metrics --region "$REGION" --namespace AWS/Bedrock \
  --dimensions Name=ModelId,Value=$MODEL --query 'Metrics[].MetricName' --output text | tr '\t' '\n' | sort -u | grep -E '^Invocations$|TokenCount$')
for m in $METRICS; do
  printf '%-28s' "$m"
  aws cloudwatch get-metric-statistics --region "$REGION" --namespace AWS/Bedrock --metric-name "$m" \
    --dimensions Name=ModelId,Value=$MODEL --start-time "$START" --end-time "$END" \
    --period 86400 --statistics Sum --query 'sum(Datapoints[].Sum)' --output text
done
cat <<EOF

# 하루 뒤 청구 금액 (usage type별)
aws ce get-cost-and-usage --time-period Start=$(date -u +%Y-%m-%d),End=$(date -u -v+2d +%Y-%m-%d) \\
  --granularity DAILY --metrics UnblendedCost UsageQuantity \\
  --group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=USAGE_TYPE \\
  --query 'ResultsByTime[].Groups[?contains(Keys[0], \`Claude\`) || contains(Keys[0], \`Bedrock\`)][]'
EOF
