# ECS Service Auto Scaling은 desired count를 대신 바꾸는 장치입니다

ECS service scheduler는 desired count만큼 task를 유지할 뿐, 그 숫자를 스스로 바꾸지 않습니다. 숫자를 바꾸는 주체는 Application Auto Scaling입니다. CloudWatch alarm이 울리면 Application Auto Scaling이 `UpdateService`로 desired count를 고치고, 그 뒤는 [desired count 핸즈온](../../desired-count/docs/1-concept.md)에서 본 scheduler 동작 그대로입니다.

## Auto Scaling에는 세 가지가 필요합니다

세 가지 중 하나라도 빠지면 scaling이 일어나지 않거나, 일어나도 다음 apply에서 되돌아갑니다.

| 구성 요소 | Terraform 리소스 | 빠지면 |
| --- | --- | --- |
| scalable target | `aws_appautoscaling_target` | Application Auto Scaling이 이 service를 모릅니다. `min_capacity`, `max_capacity`가 여기에 있습니다. |
| scaling policy | `aws_appautoscaling_policy` | 언제 몇 개로 바꿀지 기준이 없습니다. 지표와 목표값이 여기에 있습니다. |
| `ignore_changes = [desired_count]` | `aws_ecs_service`의 `lifecycle` | scale-out한 개수를 다음 `terraform apply`가 `min_capacity`로 되돌립니다. |

- scalable target의 `resource_id`는 `service/<cluster>/<service>` 형식이고 `scalable_dimension`은 `ecs:service:DesiredCount`입니다.
- 권한은 Application Auto Scaling이 처음 쓰일 때 만드는 service-linked role(`AWSServiceRoleForApplicationAutoScaling_ECSService`)이 가집니다. IAM role을 따로 만들지 않습니다.
- 세 번째 항목은 AWS가 아니라 Terraform 쪽 요구사항입니다. desired count 핸즈온은 콘솔 변경을 plan의 drift로 보는 실습이라 일부러 넣지 않았고, 이 workspace는 넣었습니다. 실습에서 scale-out 직후 `terraform plan`이 `No changes`를 내는 것으로 확인합니다.

## 지표는 ALBRequestCountPerTarget을 씁니다

target tracking은 지표 하나를 목표값 근처에 유지하도록 task 수를 계산합니다. ECS에 미리 정의된 지표는 `ECSServiceAverageCPUUtilization`, `ECSServiceAverageMemoryUtilization`, `ALBRequestCountPerTarget` 세 가지입니다.

기본 시나리오는 `ALBRequestCountPerTarget`을 씁니다. nginx가 고정 문자열만 반환해서 초당 수십 요청으로는 CPU가 거의 오르지 않습니다. 요청 수 지표는 부하 도구의 요청률을 그대로 따라가므로 몇 개로 늘어날지 미리 계산할 수 있습니다.

- 지표 값은 target group의 target 하나가 1분 동안 받은 요청 수(`Sum`, period 60)입니다.
- CPU 시나리오(`scaling_metric=cpu`)는 `ECSServiceAverageCPUUtilization`을 씁니다. 요청으로는 CPU가 오르지 않아 ECS Exec로 컨테이너 안에서 `yes`를 돌립니다. 이 부하는 접속한 task에만 걸리므로 task가 늘면 평균이 희석됩니다. 절차는 [4-cpu-handson.md](./4-cpu-handson.md)에 있습니다.
- `resource_label`로 ALB와 target group을 지정합니다. 형식은 `app/<alb>/<id>/targetgroup/<tg>/<id>`이고 Terraform에서는 두 리소스의 `arn_suffix`를 `/`로 이어 붙입니다.

## target tracking은 alarm 두 개를 만들고 숨겨진 규칙으로 판단합니다

policy를 만들면 Application Auto Scaling이 CloudWatch alarm 두 개를 직접 만듭니다. 이 실습에서 `target_value = 600`으로 만든 alarm은 아래와 같았습니다.

| alarm | 조건 | 결과 |
| --- | --- | --- |
| `TargetTracking-service/<cluster>/<service>-AlarmHigh-<uuid>` | 1분 지표가 600 초과, 3개 연속 | scale-out |
| `TargetTracking-service/<cluster>/<service>-AlarmLow-<uuid>` | 1분 지표가 540(목표의 90%) 미만, 15개 연속 | scale-in |

- scale-out은 3분, scale-in은 15분을 봅니다. 늘리는 쪽은 빠르게, 줄이는 쪽은 보수적으로 움직이도록 AWS가 정한 값이고 policy 설정으로 바꿀 수 없습니다.
- scale-out 때 새 desired count는 대략 `현재 task 수 × 지표 / 목표값`을 올림한 값입니다. 실습에서는 task 1개에 분당 1800 요청이 들어와 `1 × 1800 / 600 = 3`으로 한 번에 3이 됐습니다. 그 결과가 `max_capacity`를 넘으면 `max_capacity`에서 멈춥니다.
- `scale_out_cooldown`, `scale_in_cooldown`은 기본 300초입니다. 실습 시간을 줄이려고 60초로 낮췄습니다.
- 두 alarm의 `AlarmActions`에는 policy ARN(`arn:aws:autoscaling:...:policyName/<policy>`)이 들어 있습니다. alarm이 `ALARM`이 되면 CloudWatch가 이 policy를 호출하고, alarm History에 `Action` 줄(`Successfully executed action ...`)이 남습니다. 호출을 받은 policy가 min, max, cooldown을 보고 아무것도 하지 않을 수도 있습니다.
- alarm은 Application Auto Scaling 소유입니다(Description이 `DO NOT EDIT OR DELETE`). 직접 고치거나 action을 붙이면 policy가 갱신될 때 덮어써집니다.
- History의 `Action` 줄은 alarm이 `ALARM`으로 바뀔 때 한 번만 남습니다. scale-in에서 AlarmLow가 `ALARM`에 머무는 동안 desired가 두 번 줄었지만 `Action` 줄은 하나였습니다. scaling 횟수는 scaling activity로 셉니다.

## scale-out은 부하를 건 뒤 약 5분 걸렸습니다

실습에서 측정한 시점입니다.

| 시각(UTC) | 일어난 일 |
| --- | --- |
| 05:18:09 | k6가 초당 30 요청 시작 |
| 05:19 | ALB 지표가 분당 1800으로 올라감 |
| 05:23:10 | AlarmHigh가 `ALARM`, Application Auto Scaling이 desired count를 3으로 설정 |
| 05:23:14 | ECS가 task 2개 시작(`PROVISIONING`) |
| 05:23:52 | 두 task가 `RUNNING` |
| 05:24:01 | `SERVICE_STEADY_STATE` |

부하를 건 뒤 alarm이 울리기까지가 대부분입니다. 트래픽이 몇 초 만에 치솟는 서비스라면 이 5분 동안은 기존 task가 버텨야 합니다.

## 5분은 datapoint 3개와 alarm 평가 창 지연으로 나뉩니다

datapoint는 1분(`Period 60`) 동안의 지표를 숫자 하나로 요약한 값입니다. CPU policy라면 1분 동안 service task들의 평균 CPU(`Average`)가 점 하나가 됩니다. alarm은 이 점만 보므로 1분 안에서 몇 초 튄 값은 보지 못합니다.

AlarmHigh의 "3 out of 3"은 alarm이 세 번 울린다는 뜻이 아니라, datapoint 3개가 연속으로 threshold를 넘어야 한 번 `ALARM`이 된다는 뜻입니다. 남은 시간은 alarm 평가 창이 만듭니다. alarm이 상태를 바꿀 때 평가한 datapoint는 History의 `stateReasonData.evaluatedDatapoints`에 남는데, CPU 시나리오의 세 번 모두 평가 시각보다 2분 23초 전에 끝난 구간까지만 봤습니다.

| 평가 시각(UTC) | 평가한 datapoint 구간 | 마지막 구간이 끝난 시각 |
| --- | --- | --- |
| 06:07:23 | 06:04 | 06:05:00 |
| 06:10:23, `ALARM` | 06:05, 06:06, 06:07 | 06:08:00 |
| 06:16:23, `ALARM` | 06:11, 06:12, 06:13 | 06:14:00 |

CPU 시나리오의 첫 scale-out을 이 기준으로 나누면 아래와 같습니다.

```text
06:04:54  ECS Exec로 yes 시작
06:05:00  첫 datapoint 구간 시작                     (+6초)
06:08:00  50 초과 datapoint 3개(06:05, 06:06, 06:07) 완료  (+3분, 3 out of 3)
06:10:23  그 3개가 평가 창에 들어온 첫 평가, ALARM    (+2분 23초, 평가 창 지연)
```

- 평가 창을 뒤로 미는 이유는 늦게 들어오는 지표를 빠뜨리지 않기 위한 것으로 추정합니다. 2분 23초라는 값은 실측입니다.
- target tracking의 3 out of 3과 `Period 60`은 바꿀 수 없습니다. alarm을 직접 만드는 step scaling이면 1 out of 1로 데이터 대기를 1분으로 줄일 수 있습니다. 평가 창 지연은 그대로 남을 것으로 예상하지만 확인하지 않았습니다. 1 out of 1은 1분만 튀어도 늘어나서 늘었다 줄었다를 반복할 수 있습니다.
- 평가 창 지연까지 없애려면 alarm을 거치지 않아야 합니다. 부하 시각을 알면 scheduled scaling이나 높은 `min_capacity`로 미리 띄워 둡니다.

## scale-in은 부하가 끝난 뒤 약 17분, 한 칸씩 일어났습니다

| 시각(UTC) | 일어난 일 |
| --- | --- |
| 05:30 | k6 종료, ALB 지표가 분당 0으로 떨어짐 |
| 05:47:34 | AlarmLow가 `ALARM`, desired count 3 → 2 |
| 05:49:34 | AlarmLow가 계속 `ALARM`, desired count 2 → 1 |

- 요청이 0이어도 ALB는 target이 등록돼 있는 동안 `RequestCountPerTarget`을 `0.0`으로 보냅니다. target tracking은 지표가 비면(`INSUFFICIENT_DATA`) scale-in하지 않지만 이 지표는 비지 않습니다.
- 계산식으로는 `3 × 0 / 600 = 0`이라 min 1로 바로 내려갈 것 같지만 실제로는 한 칸씩 줄었습니다. AWS 문서는 target tracking이 scale-out은 지표에 비례해 최대한 빠르게, scale-in은 점진적으로 한다고 설명합니다.

## scaling 알림은 alarm 상태 변화 이벤트에서 받습니다

Application Auto Scaling이 EventBridge로 보내는 이벤트는 desired count가 `max_capacity`에 막혔을 때 하나뿐입니다. 1에서 2로 늘어난 것처럼 max에 닿지 않은 scaling은 이벤트가 없습니다. 그래서 알림을 두 경로로 받습니다.

| EventBridge rule | 잡는 이벤트 | 의미 |
| --- | --- | --- |
| `scaling-alarm` | `aws.cloudwatch`의 `CloudWatch Alarm State Change`, alarm 이름이 `TargetTracking-service/<cluster>/<service>-`로 시작하고 상태가 `ALARM` | scale-out 또는 scale-in이 시작됨 |
| `scaled-to-max` | `aws.application-autoscaling`의 `Application Auto Scaling Scaling Activity State Change` | 더 늘려야 하는데 max에서 막힘 |

- 두 rule 모두 SNS topic으로 보내고, SNS topic 정책은 이 두 rule ARN만 publish를 허용합니다.
- alarm 이벤트는 `ALARM`으로 바뀌는 순간 한 번만 옵니다. alarm이 계속 `ALARM`에 머물며 scaling이 여러 번 일어나도 알림은 하나입니다.
- AlarmLow도 같은 rule에 걸리므로 이미 min인데 AlarmLow가 `ALARM`이 되면 scaling 없이 알림만 옵니다. CPU 시나리오에서 실제로 한 번 받았습니다.
- `scaled-to-max`가 자주 온다면 `max_capacity`가 실제 부하보다 작다는 신호입니다.

## scaling 중 task 상태는 event capture에서 봅니다

desired count 핸즈온에서 만든 event capture와 Action Logs를 그대로 가져왔습니다. scaling에서는 둘이 기록하는 범위가 다릅니다.

| 위치 | scaling에서 보이는 것 |
| --- | --- |
| `aws application-autoscaling describe-scaling-activities` | 어떤 alarm이 어떤 policy를 실행해 desired count를 몇으로 바꿨는지 |
| Service **Events** 탭 | `has started 2 tasks`, `registered 2 targets`, `has reached a steady state` |
| event capture(**Event history** 탭) | scale-out은 task마다 `PROVISIONING → PENDING → ACTIVATING → RUNNING`, scale-in은 `DEACTIVATING → STOPPING → DEPROVISIONING → STOPPED`, 끝나면 `SERVICE_STEADY_STATE` |
| Action Logs | 기록 없음. 배포(deployment) 단위로만 남기 때문에 desired count 변경은 대상이 아닙니다. |
