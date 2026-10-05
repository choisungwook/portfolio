#!/usr/bin/env bash
# service가 지금 쓰는 task definition과 Git JSON의 차이를 보여 준다. 이미지는 배포 입력이라 비교하지 않는다.
# 사용: CLUSTER_NAME=ecs-shared-build-cluster SERVICE_NAME=hello-alpha \
#       TASK_FILE=deploy/task-definitions/hello-alpha.json bash deploy/diff-taskdef.sh
set -euo pipefail
export AWS_PAGER=""

: "${CLUSTER_NAME:?CLUSTER_NAME을 입력하세요}"
: "${SERVICE_NAME:?SERVICE_NAME을 입력하세요}"
: "${TASK_FILE:?TASK_FILE을 입력하세요}"

current=$(mktemp)
trap 'rm -f "$current"' EXIT
arn=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" \
  --query 'services[0].taskDefinition' --output text)
aws ecs describe-task-definition --task-definition "$arn" --include TAGS --output json > "$current"

echo "운영 중: ${arn##*/} (app_version=$(jq -r '[.tags[]? | select(.key == "app_version") | .value][0] // "없음"' "$current"))"
# diff 종료 코드 1은 차이 있음, 2 이상만 오류
diff -u --label "ecs/${arn##*/}" --label "git/${TASK_FILE##*/}" \
  <(jq -S -f "$(dirname "$0")/normalize.jq" "$current") <(jq -S . "$TASK_FILE") \
  && echo "차이 없음" || [[ $? -eq 1 ]]
