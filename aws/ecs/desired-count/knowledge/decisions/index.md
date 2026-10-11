# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [desired_count에 ignore_changes를 두지 않고 data source는 변수로 켠다](2026-10-desired-count-drift.md) - drift 관찰과 plan 시점 running_count 읽기를 함께 얻는 구성.
* [nginx default.conf를 파일 하나로 두고 Terraform과 compose가 공유한다](2026-10-nginx-conf-single-source.md) - file()로 heredoc에 넣어 escape 없이 conf 원본을 하나로 유지.
* [event capture와 Action Logs를 콘솔 대신 Terraform으로 만든다](2026-10-ecs-event-logs-terraform.md) - destroy로 함께 지워지도록 log group, rule, 전용 리소스 정책을 Terraform이 소유.
