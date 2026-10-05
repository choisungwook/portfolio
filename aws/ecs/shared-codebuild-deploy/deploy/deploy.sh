#!/usr/bin/env bash
# Git의 task definition JSON과 입력한 ECR 이미지 태그를 합쳐 ECS에 배포한다.
set -euo pipefail
export AWS_PAGER=""

: "${CLUSTER_NAME:?CLUSTER_NAME을 입력하세요}"
: "${SERVICE_NAME:?SERVICE_NAME을 입력하세요}"
: "${ECR_REPOSITORY:?ECR_REPOSITORY를 입력하세요}"
: "${TASK_FILE:?TASK_FILE을 입력하세요. 예: deploy/task-definitions/hello-alpha.json}"
: "${IMAGE_TAG:?IMAGE_TAG를 입력하세요. 예: v2}"

task_file="${CODEBUILD_SRC_DIR:-.}/$TASK_FILE"
rendered=$(mktemp)
trap 'rm -f "$rendered"' EXIT

# 1. 입력 확인: ECR에 없는 태그면 등록 전에 실패
digest=$(aws ecr describe-images --repository-name "$ECR_REPOSITORY" --image-ids imageTag="$IMAGE_TAG" \
  --query 'imageDetails[0].imageDigest' --output text) \
  || { echo "ECR에 ${ECR_REPOSITORY}:${IMAGE_TAG} 이미지가 없습니다" >&2; exit 1; }
repo_uri=$(aws ecr describe-repositories --repository-names "$ECR_REPOSITORY" \
  --query 'repositories[0].repositoryUri' --output text)

# 2. JSON 렌더링: __IMAGE__를 digest로 교체
jq --arg img "${repo_uri}@${digest}" '.containerDefinitions[0].image = $img' "$task_file" > "$rendered"

# 3. revision 등록
arn=$(aws ecs register-task-definition --cli-input-json "file://$rendered" \
  --tags key=app_version,value="$IMAGE_TAG" \
  --query 'taskDefinition.taskDefinitionArn' --output text)
echo "Registered: $arn (${IMAGE_TAG} = ${digest})"

# 4. service 갱신: 태스크 교체는 ECS 배포 컨트롤러가 수행
aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
  --task-definition "$arn" > /dev/null

# 5. 배포 완료 대기: wait services-stable은 rolloutState가 IN_PROGRESS일 때도 끝나므로 직접 조회
# ponytail: 자체 timeout 없음, CodeBuild build_timeout(40분)이 상한
while :; do
  read -r primary state <<< "$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" \
    --query "services[0].deployments[?status=='PRIMARY'] | [0].[taskDefinition,rolloutState]" --output text)"
  [[ "$state" == IN_PROGRESS ]] || break
  sleep 15
done

# 6. 결과 확인: circuit breaker가 롤백하면 PRIMARY가 이전 revision으로 바뀜
if [[ "$primary" != "$arn" || "$state" != COMPLETED ]]; then
  echo "배포 실패: PRIMARY=${primary}, rolloutState=${state}" >&2
  exit 1
fi
echo "Deployed: ${SERVICE_NAME} ${IMAGE_TAG} (${arn})"
