#!/usr/bin/env bash
# AWS 호출 없이 deploy.sh의 렌더링과 성공·실패 판정을 확인한다.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin"
export FAKE_WORK="$fixture" PATH="$fixture/bin:$PATH"
export CLUSTER_NAME=lab SERVICE_NAME=hello-beta ECR_REPOSITORY=ecs-shared-build-hello
export CODEBUILD_SRC_DIR="$root" TASK_FILE=deploy/task-definitions/hello-beta.json
export REPOSITORY_URI=example.dkr.ecr.ap-northeast-2.amazonaws.com/ecs-shared-build-hello
export DIGEST="sha256:$(printf '1%.0s' {1..64})"
export PREVIOUS_ARN=arn:aws:ecs:ap-northeast-2:123456789012:task-definition/ecs-shared-build-hello-beta:19
export NEW_ARN=arn:aws:ecs:ap-northeast-2:123456789012:task-definition/ecs-shared-build-hello-beta:20

# PRIMARY_RESULT로 배포 결과를 흉내 낸다. 첫 조회는 IN_PROGRESS
cat > "$fixture/bin/aws" <<'AWS'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_WORK/calls.log"
case "$1:$2" in
  ecr:describe-images)
    [[ "$*" != *imageTag=missing* ]] || { echo 'ImageNotFoundException' >&2; exit 254; }
    echo "$DIGEST" ;;
  ecr:describe-repositories) echo "$REPOSITORY_URI" ;;
  ecs:register-task-definition) cp "${4#file://}" "$FAKE_WORK/registered.json"; echo "$NEW_ARN" ;;
  ecs:update-service) ;;
  ecs:describe-services)
    if [[ ! -f "$FAKE_WORK/polled" ]]; then touch "$FAKE_WORK/polled"; printf '%s\tIN_PROGRESS\n' "$NEW_ARN"
    else printf '%b\n' "$PRIMARY_RESULT"; fi ;;
  *) exit 99 ;;
esac
AWS
chmod +x "$fixture/bin/aws"
printf '#!/usr/bin/env bash\n' > "$fixture/bin/sleep"
chmod +x "$fixture/bin/sleep"

run_deploy() {
  rm -f "$fixture/calls.log" "$fixture/registered.json" "$fixture/polled"
  bash "$root/deploy/deploy.sh" > "$fixture/output.log" 2>&1
}

PRIMARY_RESULT="$NEW_ARN\tCOMPLETED" IMAGE_TAG=v2 run_deploy
jq -e --arg img "$REPOSITORY_URI@$DIGEST" '.containerDefinitions[0].image == $img' "$fixture/registered.json" > /dev/null
diff <(jq -S 'del(.containerDefinitions[0].image)' "$root/$TASK_FILE") \
  <(jq -S 'del(.containerDefinitions[0].image)' "$fixture/registered.json")
grep -q 'key=app_version,value=v2' "$fixture/calls.log"
echo 'PASS: Git JSON 그대로 + 이미지만 digest로 교체, app_version 태그, IN_PROGRESS 뒤 COMPLETED 대기'

for case in "missing:$NEW_ARN\tCOMPLETED" "v2:$PREVIOUS_ARN\tCOMPLETED" "v2:$NEW_ARN\tFAILED"; do
  if PRIMARY_RESULT="${case#*:}" IMAGE_TAG="${case%%:*}" run_deploy; then
    cat "$fixture/output.log"; exit 1
  fi
  ! grep -q '^Deployed:' "$fixture/output.log"
done
echo 'PASS: 없는 태그, circuit breaker 롤백, FAILED는 모두 실패'

if env -u IMAGE_TAG bash "$root/deploy/deploy.sh" > /dev/null 2>&1; then exit 1; fi
echo 'PASS: IMAGE_TAG가 없으면 실패'
