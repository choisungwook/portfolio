# circuit breaker는 실패한 새 태스크 수를 셉니다

ECS deployment circuit breaker는 배포 중 실패한 새 태스크 수를 세고, 그 수가 임계치와 같아지면 배포를 `FAILED`로 바꿉니다. 시간이 아니라 횟수로 판단한다는 점이 이 핸즈온의 출발점입니다. 실습 절차는 [2-handson.md](./2-handson.md)에 있습니다.

## 실패는 RUNNING 전과 후 두 단계로 나뉩니다

ECS scheduler는 새 태스크가 `RUNNING`에 도달했는지로 단계를 나눕니다.

| 단계 | 실패 조건 | 예 | 걸리는 시간을 정하는 것 |
| --- | --- | --- | --- |
| 1단계 | 태스크가 `RUNNING`이 되기 전에 종료 | 이미지 pull 실패, secret 조회 실패 | 시간 기준 없음. 태스크가 종료되면 바로 셉니다 |
| 2단계 | `RUNNING` 뒤 health check 실패로 태스크가 교체됨 | ELB, Cloud Map, 컨테이너 health check 실패 | 각 health check의 interval, retries, 유예 시간 |

새 배포의 태스크가 하나라도 `RUNNING`이 되면 2단계로 넘어갑니다. 2단계는 health check를 통과한 태스크가 하나라도 있으면 성공입니다.

## 임계치는 desiredCount 1에서 3입니다

임계치는 `thresholdConfiguration`이 정합니다.

| type | 계산 |
| --- | --- |
| `BOUNDED_PERCENT` (기본, value 50) | `value/100 × desiredCount`를 올림하고 최소 3, 최대 200으로 자릅니다 |
| `UNBOUNDED_PERCENT` | 같은 계산에서 최소, 최대가 없습니다 |
| `COUNT` | `value`를 그대로 씁니다 |

desiredCount 1이면 `0.5 × 1`이 최소값 3보다 작아서 임계치는 3입니다. 태스크 1대짜리 서비스라도 새 태스크가 3번 실패해야 배포가 멈춥니다. 실습은 시간을 줄이려고 `COUNT` 1을 씁니다.

문서는 실패 횟수가 임계치와 같아지면 `FAILED`가 된다고 적습니다. `COUNT` 2로 실행했을 때 목표 2는 그대로 2번째 실패에서 멈췄고, 목표 1은 3번째 실패 뒤에 멈췄습니다. `확인 필요`: 1단계 실패가 임계치보다 하나 더 쌓이는 이유.

`resetOnHealthyTask`는 실패 횟수를 언제 0으로 돌릴지 정합니다.

- `true`(기본): 정상 태스크가 뜰 때마다 0으로 돌립니다. 연속 실패만 셉니다.
- `false`: 배포 전체에서 누적합니다.

Terraform AWS provider 6.69의 `deployment_circuit_breaker` 블록에는 `enable`과 `rollback`만 있습니다. 이 핸즈온은 임계치를 콘솔에서 바꾸고, 콘솔에 그 항목이 없으면 기본값 3으로 진행합니다.

## enable과 rollback은 서로 다른 일을 합니다

| 설정 | 동작 |
| --- | --- |
| `enable = true`, `rollback = true` | `FAILED` 뒤 마지막 `COMPLETED` 배포로 되돌립니다 |
| `enable = true`, `rollback = false` | `FAILED` 뒤 새 태스크 실행을 멈춥니다. 되돌리지 않습니다 |
| `enable = false` | 실패를 세지 않습니다. 배포가 `IN_PROGRESS`로 남고 새 태스크 재시도가 반복됩니다. `rollback` 값은 적용되지 않습니다 |

기본값은 경로마다 다릅니다. API와 Terraform은 꺼짐이고, 콘솔에서 새로 만드는 서비스는 켜짐입니다. Terraform으로 만든 서비스는 직접 켜지 않는 한 circuit breaker가 없습니다.

롤백 대상은 마지막 `COMPLETED` 배포입니다. 롤백이 시작되면 그 배포가 `IN_PROGRESS`로 바뀌므로, 롤백이 끝나기 전에 다음 배포가 실패하면 되돌아갈 곳이 없어 배포가 멈춥니다. 실습마다 롤백 배포가 `COMPLETED`가 된 뒤 다음 실습을 시작하는 이유입니다.

CloudWatch alarm 기반 실패 감지는 circuit breaker와 별개 기능입니다. 둘을 함께 켜면 먼저 조건을 만족한 쪽이 배포를 실패 처리합니다. 이 핸즈온은 alarm을 다루지 않습니다.

## blue/green에서는 실패한 새 태스크가 트래픽을 받지 않습니다

ECS blue/green은 ECS 배포 컨트롤러에 `strategy = BLUE_GREEN`을 준 방식입니다. 리스너 규칙 하나가 대상 그룹 2개를 가중치로 forward하고, ECS가 infrastructure role로 그 가중치를 바꿔 트래픽을 옮깁니다.

배포는 lifecycle 단계를 순서대로 지납니다. 이 핸즈온에서 볼 단계는 아래와 같습니다.

1. `SCALE_UP`: 새 revision 태스크를 가중치 0인 대상 그룹에 띄웁니다. 이 태스크는 트래픽을 받지 않습니다.
2. `PRODUCTION_TRAFFIC_SHIFT`: 리스너 규칙 가중치를 새 태스크의 대상 그룹 100, 기존 대상 그룹 0으로 바꿉니다. 한 번에 전부 옮깁니다.
3. `BAKE_TIME`: 기존 태스크와 새 태스크를 함께 둔 채 bake time(이 핸즈온은 1분) 동안 기다립니다.
4. `CLEAN_UP`: 기존 태스크를 내립니다.

서비스를 만드는 첫 배포도 이 단계를 모두 지납니다. Terraform이 리스너 규칙을 `cb-lab-blue` 100으로 만들어도, 첫 배포가 `:1` 태스크를 `cb-lab-green`에 띄우고 트래픽을 옮기므로 apply가 끝나면 `cb-lab-green`이 프로덕션입니다. 서비스의 `loadBalancers[0].targetGroupArn`은 `cb-lab-blue` 그대로라서 `terraform plan`에는 변경이 나오지 않습니다.

실습의 실패는 모두 `SCALE_UP`에서 일어납니다. 트래픽 전환 단계에 가지 못하므로 리스너 가중치는 그대로이고, 사용자는 실패를 보지 못합니다. rolling update와 다른 점입니다. rolling update는 새 태스크가 기존 태스크와 같은 대상 그룹에 들어가므로, 2단계 실패 태스크가 health check에 걸리기 전까지 트래픽을 받을 수 있습니다.

단계마다 최대 24시간이 지나면 ECS가 배포를 실패 처리하고 롤백합니다. circuit breaker를 끄면 이 24시간이 유일한 자동 정지 장치입니다.

## blue/green 지원 여부는 문서마다 다르게 적혀 있습니다

- 배포 실패 감지 개요 문서는 circuit breaker를 blue/green에서 쓸 수 있다고 적습니다.
- circuit breaker 문서는 rolling update(`ECS`) 배포 컨트롤러 서비스만 지원한다고 적습니다.

blue/green도 `ECS` 배포 컨트롤러 위에서 도는 strategy입니다. 실습에서는 blue/green 배포도 circuit breaker로 `FAILED`가 되고 롤백됐습니다. 1단계 실패(목표 1)와 2단계 실패(목표 2) 모두 같았습니다. circuit breaker 문서의 "rolling update(`ECS`)"는 strategy가 아니라 배포 컨트롤러 이름을 가리킨 표현으로 읽는 것이 실제 동작과 맞습니다.

## Sources

1. [How the Amazon ECS deployment circuit breaker detects failures](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html)
2. [Amazon ECS deployment failure detection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-failure-detection.html)
3. [Amazon ECS blue/green deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-blue-green.html)
4. [Amazon ECS blue/green service deployments workflow](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/blue-green-deployment-how-it-works.html)
5. [Updating an Amazon ECS service (console)](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/update-service-console-v2.html)
