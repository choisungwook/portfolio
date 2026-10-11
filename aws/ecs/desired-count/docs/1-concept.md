# desiredCount는 목표이고 runningCount는 관측값입니다

ECS Service에서 task 개수를 말할 때 숫자가 세 개 나옵니다. 콘솔 Service 상세 화면의 Desired, Pending, Running이고, API로는 `describe-services`의 `desiredCount`, `pendingCount`, `runningCount`입니다. 이 셋을 구분해야 "3으로 바꿨는데 왜 아직 트래픽이 한 곳으로만 가지?"와 "Terraform state에는 왜 1로 남아 있지?"에 답할 수 있습니다.

## 세 숫자는 누가 정하느냐가 다릅니다

| 값 | 의미 | 누가 바꾸나 |
| --- | --- | --- |
| `desiredCount` | service가 유지해야 할 task 수 | 사람(콘솔, CLI, Terraform) 또는 Service Auto Scaling |
| `pendingCount` | `lastStatus`가 `PENDING`인 task 수. 이미지 pull, ENI 연결 중인 task | ECS service scheduler가 task를 띄운 결과 |
| `runningCount` | `lastStatus`가 `RUNNING`인 task 수 | ECS service scheduler가 task를 띄운 결과 |

`desiredCount`만 입력값이고 나머지 둘은 관측값입니다. ECS service scheduler는 `desiredCount`와 실제 task 수를 계속 비교해서 모자라면 task를 띄우고 남으면 멈춥니다. task가 죽어도 사람이 개입하지 않고 개수가 돌아오는 이유가 이 비교 루프입니다.

## Kubernetes와 대응합니다

Kubernetes를 아는 독자라면 아래 표로 위치를 잡을 수 있습니다. 마지막 두 줄은 일대일로 맞지 않으므로 비고를 함께 봅니다.

| Kubernetes | ECS | 비고 |
| --- | --- | --- |
| `Deployment.spec.replicas` | Service `desiredCount` | |
| `kubectl get deploy`의 READY | `describe-services`의 `runningCount` | READY는 readiness 통과 수, `runningCount`는 RUNNING 상태 수라 기준이 다름 |
| ReplicaSet controller | ECS service scheduler | |
| `kubectl scale --replicas` | `aws ecs update-service --desired-count` | |
| readinessProbe | ALB target group health check | 실패하면 트래픽에서 빠지는 점은 같음. ECS는 여기에 더해 task를 교체함 |
| livenessProbe | task definition `healthCheck` | 실패하면 ECS가 task를 교체함. 컨테이너 재시작이 아니라 task 교체 |

## RUNNING이 곧 트래픽을 받는다는 뜻은 아닙니다

이 핸즈온의 task에는 health check가 두 개 붙어 있습니다. 검사하는 주체와 실패했을 때의 결과가 다릅니다.

| | 컨테이너 health check | target group health check |
| --- | --- | --- |
| 정의 위치 | task definition의 `healthCheck` | `aws_lb_target_group.health_check` |
| 검사 주체 | ECS agent가 컨테이너 안에서 명령 실행 | ALB가 task IP로 HTTP 요청 |
| 이 핸즈온 값 | `wget http://127.0.0.1/health`, interval 10초, retries 3, startPeriod 10초 | `/health`, interval 10초, healthy_threshold 2 |
| 콘솔 표시 | Tasks 탭의 Health status (`UNKNOWN` → `HEALTHY`) | Target groups의 Targets (`initial` → `healthy`) |
| 실패하면 | ECS가 task를 `UNHEALTHY`로 표시하고 교체 | ALB가 그 target으로 트래픽을 보내지 않음. ECS service scheduler도 task를 교체 |

ECS는 task가 `RUNNING`으로 넘어가기 직전의 `ACTIVATING` 단계에서 task IP를 target group에 등록합니다. 등록 직후 target 상태는 `initial`이고, ALB가 10초 간격으로 2번 연속 성공해야 `healthy`가 됩니다. 그래서 `runningCount`가 3이 된 뒤에도 최소 20초 동안 ALB는 기존 task로만 트래픽을 보냅니다. 실습 2단계에서 이 간격을 직접 봅니다.

## Terraform은 desiredCount만 압니다

`aws_ecs_service` resource의 속성 중 개수와 관련된 것은 `desired_count` 하나입니다. Terraform resource는 "내가 선언한 값"을 관리하는 도구라서 scheduler가 만든 결과인 running, pending을 속성으로 두지 않습니다.

- state의 `desired_count`는 마지막 apply 또는 refresh 시점의 값입니다. 콘솔에서 바꿔도 state는 그대로입니다.
- 콘솔에서 바꾼 값은 다음 `terraform plan`에서 drift로 보이고, apply하면 Terraform 변수 값으로 되돌아갑니다.
- `aws_ecs_service` data source는 AWS provider 6.21.0부터 `running_count`와 `pending_count`를 노출합니다([terraform-provider-aws#44842](https://github.com/hashicorp/terraform-provider-aws/issues/44842)). data source는 plan 시점에 API를 한 번 읽은 스냅샷입니다.

Service Auto Scaling을 함께 쓰는 서비스는 `lifecycle { ignore_changes = [desired_count] }`로 Terraform이 개수를 되돌리지 않게 두는 경우가 많습니다. 이 핸즈온은 drift를 관찰하는 것이 목적이라 `ignore_changes`를 두지 않았습니다.

실습은 [2-handson.md](./2-handson.md)에서 이어집니다.
