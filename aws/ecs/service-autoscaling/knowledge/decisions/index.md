# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [desired-count 예제를 복사해 새 workspace로 만들고 desired_count는 ignore_changes한다](2026-10-separate-workspace-ignore-changes.md) - drift 실습과 desired_count 소유자가 달라 코드를 나눈 이유.
* [기본 지표는 ALBRequestCountPerTarget, CPU는 ECS Exec 시나리오로 따로 둔다](2026-10-request-count-metric.md) - CPU 대신 요청 수로 도달 개수를 미리 계산하는 구성과 실측 시간.
* [scaling 알림은 alarm 상태 변화와 scaled-to-max 두 EventBridge rule로 SNS에 보낸다](2026-10-scaling-alert-eventbridge.md) - Application Auto Scaling 이벤트만으로는 max 미만 scaling을 놓치는 이유.
