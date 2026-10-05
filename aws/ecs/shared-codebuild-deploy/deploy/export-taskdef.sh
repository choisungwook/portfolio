#!/usr/bin/env bash
# service가 지금 쓰는 task definition을 Git에 둘 JSON으로 추출한다.
# 사용: bash deploy/export-taskdef.sh ecs-shared-build-cluster hello-alpha
set -euo pipefail
export AWS_PAGER=""

cluster=${1:?클러스터 이름을 입력하세요}
service=${2:?서비스 이름을 입력하세요}

arn=$(aws ecs describe-services --cluster "$cluster" --services "$service" \
  --query 'services[0].taskDefinition' --output text)

# 읽기 전용 필드 제거, 이미지는 자리표시자로, 빈 값은 PR diff를 줄이려고 제거
aws ecs describe-task-definition --task-definition "$arn" --output json \
  | jq -f "$(dirname "$0")/normalize.jq" \
  > "$(dirname "$0")/task-definitions/${service}.json"
echo "exported: $arn -> deploy/task-definitions/${service}.json"
