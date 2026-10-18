# 확인 질문

실습에서 본 것을 근거로 먼저 스스로 답해 보고, 각 질문 아래의 답과 비교합니다. 답의 실측값은 임계치 `COUNT` 2로 [2-handson.md](./2-handson.md)를 실행한 결과입니다.

## 목표 1과 2에서 중지 이유가 어떻게 달랐고, 각각 몇 단계 실패인가요?

답:

| 실습 | 중지 코드 | 중지 이유 | 태스크가 RUNNING에 갔나 | 단계 |
| --- | --- | --- | --- | --- |
| 1 | `TaskFailedToStart` | `CannotPullContainerError: pull image manifest has been retried 7 time(s): ... not found` | 아니요 | 1단계 |
| 2 | `ServiceSchedulerInitiated` | `Task failed container health checks`, 종료 코드 0 | 예, 37초 만에 `RUNNING` | 2단계 |

서비스 **Events** 탭의 배포 실패 메시지는 둘 다 `deployment failed: tasks failed to start`였습니다. 단계를 구분하려면 이벤트 메시지가 아니라 중지된 태스크의 중지 코드와 이유를 봐야 합니다.

## 실패한 배포에서 리스너 가중치는 왜 바뀌지 않았나요?

답:

두 실패 모두 `SCALE_UP` 단계에서 일어났기 때문입니다. ECS는 `PRODUCTION_TRAFFIC_SHIFT` 단계에서 리스너 규칙 가중치를 바꾸는데, 새 태스크가 정상으로 뜨지 못해 그 단계에 가지 못했습니다. 세 실습 내내 가중치는 `cb-lab-green` 100, `cb-lab-blue` 0이었고 ALB는 200을 응답했습니다.

목표 2의 새 태스크는 `cb-lab-blue` 대상 그룹에서 `healthy`였습니다. 가중치가 0이라 트래픽은 가지 않았지만, ALB health check만으로 배포를 판단했다면 이 태스크를 정상으로 봤을 것입니다. 실패를 잡은 것은 컨테이너 health check입니다.

## blue/green에서 circuit breaker가 배포를 FAILED로 바꿨나요? 문서 표현 차이와 결과가 같나요?

답:

바꿨습니다. 목표 1과 2 모두 서비스 배포 상태가 `ROLLBACK_IN_PROGRESS` → `ROLLBACK_SUCCESSFUL`로 바뀌었고, 이유는 `Service deployment rolled back because the circuit breaker threshold was exceeded.`였습니다. 서비스 배포의 circuit breaker 상태는 `MONITORING`에서 `TRIGGERED`로 바뀌었습니다.

- 배포 실패 감지 개요 문서의 "rolling update와 blue/green 지원"과 결과가 같습니다.
- circuit breaker 문서의 "rolling update(`ECS`) 배포 컨트롤러만 지원"은 blue/green도 `ECS` 배포 컨트롤러를 쓰므로 결과와 어긋나지 않습니다. 이 문장의 "rolling update"는 strategy가 아니라 배포 컨트롤러 이름으로 읽어야 실제 동작과 맞습니다.

## desiredCount 1에서 기본 임계치가 왜 3인가요?

답:

기본 `thresholdConfiguration`이 `BOUNDED_PERCENT` 50이라서입니다. `0.5 × 1`을 올림하면 1이고, `BOUNDED_PERCENT`는 결과를 최소 3으로 올립니다. 태스크가 적은 서비스가 일시적인 실패 한두 번에 롤백되지 않게 하는 하한입니다. apply 직후 서비스의 circuit breaker 설정을 조회하면 `enable: false`와 함께 이 기본값(`BOUNDED_PERCENT`, 50)이 보입니다.

이 하한은 배포가 멈추는 시간에도 영향을 줍니다. 이미지 pull 실패는 한 번에 90초가 걸리고, 목표 1은 `COUNT` 2로도 update 뒤 6분 32초가 지나서 `FAILED`가 됐습니다. 임계치가 클수록 잘못된 배포가 `SCALE_UP`에 머무는 시간이 늘어납니다.

## 목표 3에서 rollback을 켜 두었다면 롤백됐을까요?

답:

롤백되지 않습니다. `enable = false`이면 circuit breaker가 실패를 세지 않으므로 배포가 `FAILED`가 되지 않고, `rollback`은 `FAILED`가 된 배포에만 적용됩니다. `:2`로 circuit breaker를 끄고 실행했을 때 `enable=false,rollback=true`를 보냈더니 서비스에는 `rollback=false`로 저장됐습니다. 서비스 배포의 circuit breaker 상태는 `DISABLED`였고, 7분 동안 실패 2회가 쌓여도 배포는 `SCALE_UP`에 머물렀습니다. 단계마다 24시간이 지나 ECS가 배포를 실패 처리할 때까지 재시도가 이어집니다.

## 롤백으로 태스크가 사라진 뒤 실패 원인은 어디서 확인하나요?

답:

| 위치 | 남는 것 | 보존 기간 |
| --- | --- | --- |
| 서비스 **Tasks** 탭(Stopped) | 중지 코드, 중지 이유, 종료 코드 | 중지 후 1시간 |
| 서비스 **Events** 탭 | 태스크 시작과 중지, `failed container health checks`, 배포 실패, 롤백 메시지 | 최근 100개 |
| 클러스터 **Event history** 탭 | `ECS Task State Change`의 중지 이유, `SERVICE_DEPLOYMENT_FAILED`와 그 이유 | log group `/aws/events/ecs/containerinsights/cb-lab/performance`, 1일 |
| CloudWatch Logs `/aws/vendedlogs/ecs/action-logs/cb-lab` | 배포 단위 Action Logs | 1일 |
| CloudWatch Logs `/ecs/cb-lab` | 컨테이너 로그 | 1일 |

실습 뒤 Event history log group에는 `CannotPullContainerError`와 `Task failed container health checks` 중지 이유가 각각 남았고, `SERVICE_DEPLOYMENT_FAILED` 3건(circuit breaker 2건, 수동 롤백 1건)이 남았습니다. 1시간이 지나 **Tasks** 탭에서 중지된 태스크가 사라진 뒤에도 원인은 여기서 찾습니다.

목표 1의 태스크는 컨테이너가 시작되지 않았으므로 `/ecs/cb-lab`에 로그가 없습니다. 이미지 pull 실패의 원인은 중지 이유와 이벤트에만 남습니다.
