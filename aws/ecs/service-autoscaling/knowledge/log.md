# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-10-11

* **Update**: [기본 지표는 ALBRequestCountPerTarget, CPU는 ECS Exec 시나리오로 따로 둔다](decisions/2026-10-request-count-metric.md) CPU 시나리오 실측과 alarm 평가 창 지연(2분 23초)을 추가.
* **Creation**: [scaling 알림은 alarm 상태 변화와 scaled-to-max 두 EventBridge rule로 SNS에 보낸다](decisions/2026-10-scaling-alert-eventbridge.md) 결정 기록. Application Auto Scaling 이벤트가 max 도달 때만 나온다는 것을 남긴다.
* **Creation**: [기본 지표는 ALBRequestCountPerTarget, CPU는 ECS Exec 시나리오로 따로 둔다](decisions/2026-10-request-count-metric.md) 결정 기록. scale-out, scale-in 실측 시간과 0 트래픽에서도 scale-in된다는 것을 남긴다.
* **Creation**: [desired-count 예제를 복사해 새 workspace로 만들고 desired_count는 ignore_changes한다](decisions/2026-10-separate-workspace-ignore-changes.md) 결정 기록. 원본 예제와 desired_count 소유자가 다른 이유를 남긴다.
