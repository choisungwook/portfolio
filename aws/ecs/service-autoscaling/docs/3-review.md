# 정리 질문

## desired count가 1에서 2로만 늘었다면 알림은 몇 통인가요?

한 통입니다. AlarmHigh가 `ALARM`으로 바뀐 alarm 이벤트만 옵니다. Application Auto Scaling 이벤트는 desired count가 `max_capacity`에 막혔을 때만 나오므로 max 3에 닿지 않은 2에서는 나오지 않습니다. 실습에서 두 통을 받은 것은 `1 × 1800 / 600 = 3`이 max와 같았기 때문입니다.

## Terraform 코드에서 Auto Scaling에 꼭 필요한 것은 무엇인가요?

세 가지입니다.

1. `aws_appautoscaling_target`: service를 Application Auto Scaling에 등록하고 min과 max를 정합니다.
2. `aws_appautoscaling_policy`: 지표와 목표값을 정합니다.
3. `aws_ecs_service`의 `lifecycle { ignore_changes = [desired_count] }`: 빠지면 다음 apply가 늘어난 task를 `min_capacity`로 되돌립니다.

IAM role은 필요 없습니다. service-linked role이 첫 사용 때 자동으로 생깁니다.

## scale-out보다 scale-in이 느린 이유는 무엇인가요?

target tracking이 만드는 AlarmHigh는 3분, AlarmLow는 15분 연속을 봅니다. 줄이는 쪽을 보수적으로 둔 AWS 기본값이고 policy 설정으로 바꿀 수 없습니다. 더 빨리 줄여야 하면 alarm을 직접 만드는 step scaling을 씁니다.

## 요청이 0이 되면 target tracking은 scale-in을 하나요?

이 구성에서는 합니다. ALB는 target이 등록돼 있으면 요청이 없어도 `RequestCountPerTarget`을 `0.0`으로 보내서 AlarmLow가 15분 뒤 `ALARM`이 됩니다. target tracking은 지표가 비어 있으면(`INSUFFICIENT_DATA`) scale-in하지 않으므로, 트래픽이 끊기면 datapoint 자체가 사라지는 지표를 쓸 때는 scale-in이 멈출 수 있습니다.

## 계산상 0개가 필요한데 왜 3 → 1로 한 번에 줄지 않았나요?

target tracking은 scale-out은 지표에 비례해 한 번에, scale-in은 점진적으로 합니다. 가용성을 지키려는 비대칭이라 실습에서는 3 → 2 → 1로 2분 간격을 두고 줄었습니다. 간격은 `scale_in_cooldown` 60초와 alarm 평가 주기가 만듭니다.
