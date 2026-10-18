# blue/green 배포에서 circuit breaker의 1단계, 2단계 실패와 미사용을 비교하는 실습

nginx 1대짜리 Fargate 서비스를 ECS blue/green으로 배포하면서 circuit breaker가 이미지 pull 실패(1단계)와 health check 실패(2단계)를 어떻게 세는지, 꺼 두면 무엇이 달라지는지 확인합니다. 배경은 [1-concept.md](./1-concept.md)에, 환경 생성과 삭제는 [setup.md](./setup.md)에 있습니다.

시간을 줄이려고 임계치를 `COUNT` 1로 둡니다. 실측값은 2026-10-18에 ap-northeast-2에서 `COUNT` 2로 한 번 실행한 값이고, 예상 시간은 그 실측값으로 계산했습니다.

## 실습 환경

| 리소스 | 설정 |
| --- | --- |
| ECS cluster | `cb-lab` |
| ECS service | `cb-lab-svc`, desiredCount 1, 배포 컨트롤러 `ECS`, strategy `BLUE_GREEN`, bake time 1분, `healthCheckGracePeriodSeconds` 0, circuit breaker 꺼짐 |
| ALB | `cb-lab-alb`, listener 80, 프로덕션 리스너 규칙 1개(`cb-lab-blue` 100 / `cb-lab-green` 0으로 생성) |
| 대상 그룹 | `cb-lab-blue`, `cb-lab-green`. health check `/`, interval 5, timeout 2, healthy 2, unhealthy 2, deregistration delay 5초 |

태스크 정의 `cb-lab`에는 revision 3개가 있습니다.

| revision | 이미지 | 컨테이너 health check | 용도 |
| --- | --- | --- | --- |
| `:1` | `public.ecr.aws/nginx/nginx:stable-alpine` | `wget -q -O /dev/null http://127.0.0.1/ \|\| exit 1`, interval 5, timeout 2, retries 1 | 정상 버전, 롤백 대상 |
| `:2` | `public.ecr.aws/nginx/nginx:does-not-exist` | `:1`과 같음 | 목표 1: 1단계 실패 |
| `:3` | `:1`과 같음 | `exit 1`, interval 5, timeout 2, retries 1, startPeriod 0 | 목표 2, 3: 2단계 실패 |

revision 번호는 destroy 뒤 다시 apply하면 이어서 늘어납니다. 이 문서는 `:1`, `:2`, `:3`으로 쓰고, 실제 번호는 아래 명령으로 확인합니다.

```bash
cd aws/ecs/circuit-breaker  # 저장소 루트 기준
terraform -chdir=terraform output task_definition_revisions
```

Terraform은 서비스의 `task_definition`, `deployment_circuit_breaker`와 리스너 규칙의 `action`을 `ignore_changes`로 둡니다. 콘솔에서 바꾼 값과 ECS가 바꾼 가중치를 다음 apply가 되돌리지 않습니다.

## [목표 0] 시작 상태 확인 (1분)

콘솔 경로는 모두 **ECS > Clusters > cb-lab > Services > cb-lab-svc**에서 출발합니다.

1. **Deployments** 탭에서 맨 위 배포가 `cb-lab:1`이고 `COMPLETED`인지 확인합니다.
2. **Tasks** 탭에서 실행 중인 태스크가 1대이고 Health status가 `HEALTHY`인지 확인합니다.
3. **EC2 > Load balancers > cb-lab-alb > Listeners and rules**에서 HTTP:80 규칙을 열고 가중치를 기록합니다.
   - apply 직후에는 `cb-lab-green` 100, `cb-lab-blue` 0입니다.
   - Terraform은 `cb-lab-blue` 100으로 만들지만, 서비스를 만드는 첫 배포도 blue/green이라 ECS가 `:1` 태스크를 green에 띄우고 트래픽을 옮겼습니다.
   - 이 문서는 프로덕션을 `cb-lab-green`, 새 revision 태스크가 들어가는 대상 그룹을 `cb-lab-blue`로 씁니다.
4. 브라우저에서 ALB DNS 이름으로 접속해 nginx 기본 페이지를 확인합니다.
   - DNS 이름은 `terraform -chdir=terraform output -raw alb_dns_name`으로 확인합니다.

## [목표 1] 이미지 pull 실패(1단계)로 FAILED와 롤백 보기 (예상 5~6분)

1. 서비스 화면에서 **Update**를 누릅니다.
2. **Task definition**의 revision을 `2`로 바꿉니다.
3. **Deployment failure detection**을 펼치고 **Use the Amazon ECS deployment circuit breaker**와 **Rollback on failures**를 켭니다.
4. 임계치(threshold) 항목이 있으면 `COUNT` 1로 둡니다.
   - 항목이 없으면 1~5단계를 아래 CLI 명령으로 대신합니다. 기본값 3으로 진행하면 실패가 더 쌓여 5분 이상 더 걸립니다.
5. **Update**를 누릅니다.
6. **Deployments** 탭에서 새 배포를 엽니다.
   - 단계가 `SCALE_UP`에서 넘어가지 않습니다.
7. **Tasks** 탭에서 필터를 **Stopped**로 바꿉니다.
   - 1분 30초쯤 뒤 태스크가 중지 코드 `TaskFailedToStart`, 중지 이유 `CannotPullContainerError: pull image manifest has been retried 7 time(s): ... not found`로 멈춥니다.
   - ECS가 pull을 7번 재시도해서 태스크 하나가 실패하는 데 90초가 걸립니다.
8. **Events** 탭에서 아래 메시지가 순서대로 나오는지 봅니다.
   - `was unable to place a task. Reason: CannotPullContainerError`
   - `deployment failed: tasks failed to start`
   - `rolling back to deployment`
9. 롤백 중에 리스너 규칙을 다시 열어 `cb-lab-green` 100이 그대로인지 확인합니다.
10. **Deployments** 탭에서 `cb-lab:1` 배포가 `COMPLETED`가 될 때까지 기다립니다.
    - 실측(`COUNT` 2)에서는 실패 3회 뒤 배포가 `FAILED`가 됐고, 롤백은 1분 40초 걸렸습니다.
    - 1단계 실패는 임계치보다 하나 더 쌓인 뒤 `FAILED`가 됐습니다. `COUNT` 1이면 실패 2회 뒤 `FAILED`가 될 것으로 예상합니다. `확인 필요`: 1단계 실패가 임계치보다 하나 더 쌓이는 이유.

4단계에서 콘솔에 임계치 항목이 없으면 1~5단계를 아래 명령으로 대신합니다. `--deployment-configuration`은 strategy와 bake time까지 다시 쓰므로 두 값을 함께 넘깁니다.

```bash
aws ecs update-service --cluster cb-lab --service cb-lab-svc --task-definition cb-lab:2 \
  --deployment-configuration "strategy=BLUE_GREEN,bakeTimeInMinutes=1,deploymentCircuitBreaker={enable=true,rollback=true,thresholdConfiguration={type=COUNT,value=1}}"
```

## [목표 2] health check 실패(2단계)로 FAILED와 롤백 보기 (예상 4분)

1. 목표 1의 롤백 배포가 `COMPLETED`인지 확인합니다.
2. **Update**를 누르고 revision을 `3`으로 바꿉니다. circuit breaker 설정은 그대로 둡니다.
3. **Update**를 누릅니다.
4. **Tasks** 탭에서 새 태스크의 Health status를 봅니다.
   - 태스크가 40초쯤 뒤 `RUNNING`이 되고, 7초 안에 `UNHEALTHY`로 바뀝니다.
5. **EC2 > Target groups > cb-lab-blue > Targets**를 엽니다.
   - 같은 태스크가 여기서는 `healthy`입니다. ALB는 `/`를 호출하고 nginx가 정상 응답하기 때문입니다. ALB는 컨테이너 health check 결과를 모릅니다.
6. **Events** 탭에서 아래 메시지를 확인합니다.
   - `Amazon ECS replaced 1 tasks due to an unhealthy status`: ECS가 `UNHEALTHY` 태스크를 바로 멈추지 않고 교체 태스크를 먼저 띄웁니다.
   - `failed container health checks`: 태스크가 중지된 시점입니다. 실패 횟수는 이 시점에 올라갑니다.
7. **Tasks** 탭(Stopped)에서 중지 이유를 확인합니다.
   - `Task failed container health checks`, 종료 코드 0입니다. 목표 1과 달리 태스크가 `RUNNING`까지 갔으므로 2단계 실패입니다.
8. **Events** 탭에서 `deployment failed: tasks failed to start`와 `rolling back to deployment`가 나오는지 확인합니다.
   - 실패 메시지는 목표 1과 같습니다. 1단계와 2단계는 이벤트 메시지가 아니라 중지 이유로 구분합니다.
   - 실측(`COUNT` 2)에서는 실패 2회에서 문서대로 `FAILED`가 됐습니다. `COUNT` 1이면 첫 실패(update 뒤 2분쯤)에서 `FAILED`가 될 것으로 예상합니다.
9. 리스너 가중치가 바뀌지 않았는지, `cb-lab:1` 배포가 `COMPLETED`가 되는지 확인합니다.
   - 실측 롤백 시간은 1분 50초입니다.

CLI로 목표 1을 실행했다면 2~3단계를 아래 명령으로 대신합니다. circuit breaker 설정은 서비스에 남아 있으므로 revision만 바꿉니다.

```bash
aws ecs update-service --cluster cb-lab --service cb-lab-svc --task-definition cb-lab:3
```

## [목표 3] circuit breaker를 끄면 태스크가 떠도 배포가 멈추지 않는 것 보기 (예상 7분)

목표 2와 같은 실패를 circuit breaker만 끄고 다시 봅니다. 켰을 때는 멈췄던 배포가 꺼 두면 끝나지 않는 것을 비교합니다. 아래 결과는 `:2`로 측정한 값과 목표 2의 실측값으로 정한 예상입니다.

1. 목표 2의 롤백 배포가 `COMPLETED`인지 확인합니다.
2. **Update**를 누르고 revision을 `3`으로 바꿉니다.
3. **Use the Amazon ECS deployment circuit breaker**를 끄고 **Update**를 누릅니다.
4. **Tasks** 탭에서 새 태스크가 `RUNNING` → `UNHEALTHY` → 교체되는 것을 봅니다.
5. **EC2 > Target groups > cb-lab-blue > Targets**에서 타깃이 등록되고 해제되는 것을 봅니다.
   - 타깃은 `healthy`가 되지만 가중치가 0이라 사용자 요청은 받지 않습니다.
6. 5분 동안 **Deployments** 탭과 **Events** 탭을 봅니다.
   - 배포는 `IN_PROGRESS`, 단계는 `SCALE_UP`에 머뭅니다.
   - **Events** 탭에 `replaced 1 tasks due to an unhealthy status`가 반복되고 `deployment failed`는 나오지 않습니다.
   - `has started 1 tasks` 간격을 적어 둡니다. 실패가 반복될 때 ECS가 실행 간격을 늘리는지는 `:2`(시작 실패)에서만 측정했습니다.
7. 브라우저에서 ALB에 접속해 서비스가 정상 응답하는지 확인합니다.
   - 프로덕션 트래픽은 계속 `cb-lab-green`의 `:1`로 갑니다. 사용자 영향이 없어서 **Deployments** 탭을 보지 않으면 실패를 알아채기 어렵습니다.
8. **Deployments** 탭에서 진행 중인 배포를 선택하고 롤백합니다.
9. `cb-lab:1` 배포가 `COMPLETED`가 되는지 확인합니다.
   - 배포 이유에 `rollback initiated by user action (stop-service-deployment)`가 남습니다.
   - `:2`로 실행했을 때 수동 롤백은 1분 46초 걸렸습니다.

2~3단계를 CLI로 하려면 아래 명령을 씁니다. `enable=false,rollback=true`를 보내도 ECS는 `rollback=false`로 저장하므로 처음부터 false로 씁니다.

```bash
aws ecs update-service --cluster cb-lab --service cb-lab-svc --task-definition cb-lab:3 \
  --deployment-configuration "strategy=BLUE_GREEN,bakeTimeInMinutes=1,deploymentCircuitBreaker={enable=false,rollback=false}"
```

8단계에서 콘솔의 롤백 버튼을 찾지 못하면 아래 명령으로 대신합니다. 진행 중인 서비스 배포 ARN을 조회한 뒤 `ROLLBACK`으로 멈춥니다.

```bash
DEPLOYMENT=$(aws ecs list-service-deployments --cluster cb-lab --service cb-lab-svc --status IN_PROGRESS \
  --query 'serviceDeployments[0].serviceDeploymentArn' --output text)
aws ecs stop-service-deployment --service-deployment-arn "$DEPLOYMENT" --stop-type ROLLBACK
```

blue/green은 단계마다 24시간이 지나야 자동으로 실패하고 롤백합니다. circuit breaker를 끄면 그 전까지는 사람이 멈춰야 합니다.

## [목표 4] 태스크가 사라진 뒤 실패 기록 찾기 (2분)

1. **ECS > Clusters > cb-lab > Event history** 탭을 엽니다.
2. 중지 이유 `CannotPullContainerError`와 `Task failed container health checks`를 찾습니다.
   - 중지된 태스크는 1시간 뒤 **Tasks** 탭에서 사라지지만, 이 기록은 1일 보관됩니다.
3. 배포 이벤트 `SERVICE_DEPLOYMENT_FAILED`를 찾습니다.
   - 목표 1, 2는 circuit breaker가, 목표 3은 수동 롤백이 남긴 기록입니다.
4. **CloudWatch > Log groups > /ecs/cb-lab**을 엽니다.
   - 목표 1의 태스크는 컨테이너가 시작되지 않아서 로그가 없습니다. 이미지 pull 실패의 원인은 중지 이유와 이벤트에만 남습니다.

## [목표 5] 정리 (1분)

1. 서비스 revision이 `cb-lab:1`이고 배포가 `COMPLETED`인지 확인합니다.
2. 리스너 가중치가 목표 0에서 기록한 값과 같은지 확인합니다.
3. 실습이 끝났으면 [setup.md](./setup.md)의 Down으로 리소스를 지웁니다.

확인 질문과 답은 [3-review.md](./3-review.md)에 있습니다.
