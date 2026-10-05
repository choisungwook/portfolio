# AI 적용 지침: ECS 배포 파이프라인을 다른 프로젝트에 적용하기

이 문서는 다른 저장소나 다른 ECS 서비스에 이 아키텍처를 적용하려는 AI agent가 읽는 지침이다. 사람에게 설명하는 문서가 아니라, 너(agent)가 사용자 환경을 확인하고, 코드를 만들고, 실제 배포로 검증하는 순서를 담았다. 이 대화나 이 저장소를 볼 수 없어도 따라 할 수 있도록 핵심 코드는 문서 안에 넣었다.

## 이 아키텍처가 푸는 문제

ECS에는 Argo CD 같은 GitOps 도구가 없다. 그렇다고 Terraform으로 매 배포를 하면 이미지가 바뀔 때마다 코드 변경과 apply가 필요하고, circuit breaker가 롤백하면 Terraform state와 운영 상태가 어긋난다. 그래서 이렇게 나눈다.

1. ECS 설정 중 **이미지를 뺀 나머지**는 Git JSON으로 관리한다. 설정 변경은 PR로 리뷰되고 이력이 남는다.
2. **이미지 태그는 배포할 때 입력**한다. 새 이미지마다 Git commit이 생기지 않고, 롤백도 이전 태그를 입력하면 끝난다.
3. 최초 task definition과 service만 Terraform으로 만들고, 이후 배포는 Bash 스크립트가 ECS API로 한다. 태스크 교체와 자동 롤백은 ECS 배포 컨트롤러(rolling update + circuit breaker)에 맡긴다.

감수하는 것도 알고 시작한다. 지금 운영 중인 이미지 버전은 Git이 아니라 ECS(task definition의 `app_version` 태그)에서 조회해야 한다. 자동 롤백 뒤 Git JSON을 되돌리는 일은 사람이 한다. 사용자가 이 두 가지를 받아들일 수 없다면 이 아키텍처가 맞지 않는다고 먼저 말한다.

## 전체 흐름

서비스마다 CodePipeline 하나, CodeBuild 프로젝트는 공용 하나:

```text
사용자 ─ IMAGE_TAG ─▶ 서비스별 CodePipeline (SERVICE_NAME, TASK_FILE 고정)
                         │ Source: GitHub clone 참조
                         ▼
                      공용 CodeBuild ─ deploy.sh
                         │ 1. ECR 태그 → digest
                         │ 2. Git JSON의 __IMAGE__ 교체
                         │ 3. register-task-definition (+ app_version 태그)
                         │ 4. update-service
                         │ 5. PRIMARY rolloutState 조회
                         ▼
                      ECS 배포 컨트롤러 (rolling update, circuit breaker)
```

## 1단계: 사용자 환경 확인

코드를 쓰기 전에 아래를 확인한다. 답에 따라 만들 파일이 달라지기 때문이다. 코드에서 알 수 있는 것은 직접 찾고, 사용자만 아는 것만 묻는다.

| 확인할 것 | 왜 필요한가 | 기본값 |
| --- | --- | --- |
| ECS 서비스 개수와 이름 | 서비스마다 Pipeline·JSON 하나씩 | - |
| 이미 운영 중인 서비스인가 | 운영 중이면 Terraform 생성을 건너뛰고 바로 추출 | 신규 |
| 환경(dev/prod)이 계정별로 나뉘나 | JSON에 role ARN·계정 ID가 들어가므로 환경별 파일 필요 | 단일 환경 |
| 서비스당 컨테이너 수 | 스크립트는 컨테이너 1개를 가정 | 1개 |
| 소스 저장소(GitHub 등)와 branch | Source action과 connection | GitHub |
| 저장소가 public인가 | PR comment·로그에 설정이 노출됨 | - |
| 이미지 빌드 주체 | 이 파이프라인은 이미지를 빌드하지 않음 | 기존 CI |
| AWS 프로필·리전 | 검증할 때 실제 배포 | - |

컨테이너가 2개 이상(sidecar 등)이면 `.containerDefinitions[0]` 대신 이름으로 찾도록 바꾼다(아래 "변형").

## 2단계: 인프라 (Terraform)

최초 생성에만 Terraform을 쓴다. 이후 Terraform apply가 배포를 되돌리지 않게 하는 두 줄이 핵심이다.

task definition과 service의 lifecycle 설정:

```hcl
resource "aws_ecs_task_definition" "app" {
  # family, cpu, memory, roles, container_definitions(image는 최초 이미지 digest) ...
  lifecycle {
    ignore_changes = all # 최초 생성 전용. 이후 설정은 Git JSON이 원본
  }
}

resource "aws_ecs_service" "app" {
  task_definition = aws_ecs_task_definition.app.arn
  deployment_controller { type = "ECS" }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle {
    ignore_changes = [task_definition] # 배포 스크립트가 바꾼 revision 유지
  }
}
```

CodePipeline은 V2, `execution_mode = "QUEUED"`로 만든다. 서비스마다 하나다.

- 실행 변수 `IMAGE_TAG`: **기본값 없음**. 비우면 실행이 안 되게 해서 실수로 엉뚱한 이미지를 배포하지 않는다.
- Source action: `CodeStarSourceConnection`, `OutputArtifactFormat = "CODEBUILD_CLONE_REF"`, `DetectChanges = "false"`(push만으로 배포되지 않음).
- Build action: 공용 CodeBuild 프로젝트, 환경변수 `SERVICE_NAME`, `TASK_FILE`(서비스 JSON 경로), `IMAGE_TAG = "#{variables.IMAGE_TAG}"`.

CodeBuild 프로젝트는 source·artifacts type `CODEPIPELINE`, 고정 환경변수 `CLUSTER_NAME`, `ECR_REPOSITORY`, `AWS_DEFAULT_REGION`, 모노레포면 `SOURCE_DIRECTORY`. build_timeout은 배포 대기의 상한이 되므로 40분 정도로 둔다. 이미지 빌드를 안 하므로 privileged mode는 끈다.

`CODEBUILD_CLONE_REF`를 쓰면 S3에는 소스 ZIP 대신 clone 참조만 저장되고 CodeBuild가 직접 git clone한다. 모노레포에서 실행마다 저장소 전체 ZIP이 쌓이는 것을 막는다. 대신 CodeBuild role에도 connection 사용 권한이 필요하다. 이것을 빠뜨리면 Source는 성공하고 CodeBuild clone에서 실패한다.

### IAM 권한

CodeBuild role에 줄 권한(서비스 ARN, family, repository로 범위를 좁힌다):

| 권한 | 범위 | 용도 |
| --- | --- | --- |
| `ecr:DescribeImages`, `ecr:DescribeRepositories` | 해당 ECR repository | 태그 → digest |
| `ecs:RegisterTaskDefinition` | `task-definition/<family>:*` | revision 등록 |
| `ecs:TagResource` | 같은 family, 조건 `ecs:CreateAction = RegisterTaskDefinition` | `app_version` 태그 |
| `ecs:UpdateService`, `ecs:DescribeServices` | 대상 service ARN | 배포와 상태 조회 |
| `iam:PassRole` | task role, execution role, 조건 `iam:PassedToService = ecs-tasks.amazonaws.com` | 등록 시 role 전달 |
| `codeconnections:UseConnection` | 사용하는 connection | clone |
| `s3:GetObject*`, `logs:CreateLogStream`, `logs:PutLogEvents` | artifact bucket, build log group | 실행 |

CodePipeline role: `codebuild:StartBuild`, `codebuild:BatchGetBuilds`(공용 프로젝트), `UseConnection`, artifact bucket의 `s3:GetObject*`/`s3:PutObject`.

## 3단계: Git JSON 추출

Terraform apply 뒤(또는 이미 운영 중인 서비스라면 바로) service가 쓰는 task definition을 JSON으로 추출해 commit한다. JSON을 손으로 쓰지 않는 이유는, AWS가 채운 기본값까지 그대로 가져와야 다음 배포에서 의도치 않은 차이가 생기지 않기 때문이다.

읽기 전용 필드를 지우고 이미지를 자리표시자로 바꾸는 정규화 필터(`deploy/normalize.jq`):

```jq
.taskDefinition
| del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
      .registeredAt, .registeredBy, .deregisteredAt)
| .containerDefinitions[0].image = "__IMAGE__"
| del(.. | select(. == [] or . == {}))
```

service의 현재 task definition을 서비스 JSON으로 저장:

```bash
arn=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].taskDefinition' --output text)
aws ecs describe-task-definition --task-definition "$arn" --output json \
  | jq -f deploy/normalize.jq > "deploy/task-definitions/${SERVICE}.json"
```

읽기 전용 필드가 남으면 `register-task-definition`이 실패한다. 마지막 `del`은 `mountPoints: []` 같은 빈 값을 지워 PR diff를 읽기 쉽게 한다. 같은 필터를 diff 스크립트에도 쓰면 추출과 비교 형식이 어긋나지 않는다.

JSON에는 계정 ID가 든 role ARN과 로그 그룹이 들어간다. 환경(계정)마다 따로 추출해 `task-definitions/<service>.<env>.json`처럼 나눈다. 비밀값은 `environment`가 아니라 `secrets`(`valueFrom`)로 넣어야 Git에 평문으로 남지 않는다.

## 4단계: 배포 스크립트

CodeBuild가 실행하는 `deploy/deploy.sh`다. 그대로 쓰고, 이름이나 경로만 프로젝트에 맞춘다.

입력 확인부터 결과 판정까지 6단계:

```bash
#!/usr/bin/env bash
set -euo pipefail
export AWS_PAGER=""

: "${CLUSTER_NAME:?}" "${SERVICE_NAME:?}" "${ECR_REPOSITORY:?}" "${TASK_FILE:?}" "${IMAGE_TAG:?}"
task_file="${CODEBUILD_SRC_DIR:-.}/$TASK_FILE"
rendered=$(mktemp)
trap 'rm -f "$rendered"' EXIT

# 1. ECR에 없는 태그면 등록 전에 실패
digest=$(aws ecr describe-images --repository-name "$ECR_REPOSITORY" --image-ids imageTag="$IMAGE_TAG" \
  --query 'imageDetails[0].imageDigest' --output text) \
  || { echo "ECR에 ${ECR_REPOSITORY}:${IMAGE_TAG} 이미지가 없습니다" >&2; exit 1; }
repo_uri=$(aws ecr describe-repositories --repository-names "$ECR_REPOSITORY" \
  --query 'repositories[0].repositoryUri' --output text)

# 2. 이미지는 태그가 아니라 digest로 넣는다
jq --arg img "${repo_uri}@${digest}" '.containerDefinitions[0].image = $img' "$task_file" > "$rendered"

# 3. revision 등록, 운영 버전 조회용 태그
arn=$(aws ecs register-task-definition --cli-input-json "file://$rendered" \
  --tags key=app_version,value="$IMAGE_TAG" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

# 4. service 갱신
aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" \
  --task-definition "$arn" > /dev/null

# 5. 배포가 끝날 때까지 PRIMARY rolloutState 조회
while :; do
  read -r primary state <<< "$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" \
    --query "services[0].deployments[?status=='PRIMARY'] | [0].[taskDefinition,rolloutState]" --output text)"
  [[ "$state" == IN_PROGRESS ]] || break
  sleep 15
done

# 6. circuit breaker가 롤백하면 PRIMARY가 이전 revision이 된다
if [[ "$primary" != "$arn" || "$state" != COMPLETED ]]; then
  echo "배포 실패: PRIMARY=${primary}, rolloutState=${state}" >&2
  exit 1
fi
echo "Deployed: ${SERVICE_NAME} ${IMAGE_TAG} (${arn})"
```

buildspec은 clone한 commit이 Pipeline이 고른 commit과 같은지 확인한 뒤 스크립트를 실행한다:

```yaml
version: 0.2
phases:
  pre_build:
    commands:
      - test "$(git rev-parse HEAD)" = "$CODEBUILD_RESOLVED_SOURCE_VERSION"
  build:
    commands:
      - bash "$CODEBUILD_SRC_DIR/$SOURCE_DIRECTORY/deploy/deploy.sh"
```

### 5번에 `aws ecs wait services-stable`을 쓰지 않는 이유

`services-stable`은 배포가 1개이고 running = desired인지만 본다. 실제로 이 조건이 만족된 뒤에도 PRIMARY의 rolloutState는 한동안 `IN_PROGRESS`였고, 그 직후 PRIMARY를 확인하면 정상 배포가 실패로 판정됐다. 그래서 rolloutState가 `IN_PROGRESS`를 벗어날 때까지 직접 조회한다. 롤백되면 PRIMARY가 이전 ARN(`COMPLETED`)이 되므로 ARN 비교로 실패를 잡는다. 스크립트 자체 timeout은 없고 CodeBuild build_timeout이 상한이다.

## 5단계: 검증

API가 성공을 돌려줬다고 끝내지 않는다. 실제 배포로 아래를 모두 확인하고 결과를 사용자에게 보고한다. 하지 못한 항목은 "검증하지 않음"으로 적는다.

1. **로컬 mock 테스트**: `aws`를 가짜 실행 파일로 바꿔 PATH 앞에 두고, 성공(IN_PROGRESS 뒤 COMPLETED), 없는 태그, PRIMARY가 이전 ARN, FAILED, IMAGE_TAG 누락을 확인한다. 성공 시 등록된 JSON이 Git JSON과 이미지만 다른지 diff로 본다.
2. **추출 왕복**: 추출 스크립트를 다시 돌려 Git JSON과 diff가 없는지 본다.
3. **terraform plan**: 기존 task definition·service에 변경이 없는지 본다. 있으면 `ignore_changes`가 빠진 것이다.
4. **실제 이미지 배포**: 다른 태그로 배포해 새 revision, `app_version` 태그, PRIMARY COMPLETED, 실행 중인 task의 imageDigest를 확인한다.
5. **설정만 변경**: JSON의 환경변수 하나를 바꾸고 현재 태그로 배포해 digest가 그대로인지 본다.
6. **없는 태그**: 등록 전에 실패하고 revision이 늘지 않는지 본다.
7. **자동 롤백**: healthCheck를 `["CMD", "python", "-c", "raise SystemExit(1)"]`처럼 항상 실패하게 만든 JSON으로 배포해 circuit breaker 롤백과 스크립트 실패를 확인한다(수 분 걸림). 끝나면 정상 JSON으로 되돌린다.
8. **Pipeline 경유**: push 후 콘솔에서 Release change로 실행해 Source commit과 CodeBuild의 `git rev-parse HEAD`가 같은지 본다.

## 변형

- **컨테이너가 여러 개**: `CONTAINER_NAME`을 입력으로 받고 `(.containerDefinitions[] | select(.name == $name)).image = $img`로 바꾼다. normalize.jq의 `[0]`도 같이 바꾼다.
- **환경이 여러 개**: JSON을 환경별로 두고 Pipeline action의 `TASK_FILE`만 환경별로 다르게 준다. 공용 CodeBuild는 그대로 쓴다.
- **ALB 뒤의 서비스**: service에 `health_check_grace_period_seconds`를 둔다. 배포 판정 로직은 같다.
- **PR에서 변경 미리 보기**: 운영 task definition을 같은 normalize.jq로 바꾼 뒤 Git JSON과 `diff -u` 한 결과를 GitHub Actions가 PR comment로 남긴다. AWS 인증은 OIDC, role 권한은 `ecs:DescribeServices`와 `ecs:DescribeTaskDefinition`만 준다. public 저장소라면 fork PR은 실행하지 않고, comment 트리거는 작성자의 저장소 권한(OWNER/MEMBER/COLLABORATOR)을 확인한다. comment 트리거는 기본 branch의 워크플로로만 실행되므로 merge 전에는 검증할 수 없다.

## 하지 않는 것

이유와 함께 적는다. 사용자가 원하면 바꿀 수 있지만, 바꾸기 전에 아래 이유를 알려 준다.

- **이미지 태그를 Git JSON에 넣기**: 새 이미지마다 commit이 생기고 롤백 뒤 Git과 운영이 어긋난다. 이 아키텍처의 첫 번째 결정을 뒤집는 것이다.
- **IMAGE_TAG 생략 시 운영 이미지 유지 같은 편의 모드**: 입력 경로가 둘이 되고 IAM 권한(`DescribeTaskDefinition`)과 분기가 늘어난다. 설정만 바꿀 때도 현재 태그를 조회해서 넣는다.
- **이미지를 태그로 등록**: 같은 태그로 다시 push하면 revision이 가리키는 이미지가 바뀐다. digest로 넣는다. ECR 태그는 IMMUTABLE로 둔다.
- **이전 revision을 다시 지정하는 롤백**: 항상 새 revision을 등록한다. revision 번호와 앱 버전은 별개다.
- **Terraform apply로 설정 배포**: `ignore_changes` 때문에 반영되지 않는다. 설정은 JSON을 고쳐 Pipeline으로 배포한다.
- **CodeBuild에서 이미지 빌드**: 이 파이프라인은 배포만 한다. 이미지 빌드·push는 소스 저장소의 CI(GitHub Actions 등)에 둔다.
- **공개 문서·commit에 비밀값**: 계정 ID 수준을 넘는 값(키, 토큰, 비밀 환경변수)은 Git과 PR comment에 남기지 않는다.

## 참고 구현

이 저장소의 `aws/ecs/shared-codebuild-deploy/`가 이 지침의 실제 구현이다. 읽을 수 있으면 `workload/`(Pipeline·CodeBuild·ECS), `foundation/iam.tf`(권한), `deploy/`(스크립트), `tests/test_deploy.sh`(mock 테스트), `knowledge/decisions/`(결정 이유)를 그대로 참고한다.
