# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-10-11

* **Creation**: [event capture와 Action Logs를 콘솔 대신 Terraform으로 만든다](decisions/2026-10-ecs-event-logs-terraform.md) 결정 기록. 콘솔 버튼과 공용 리소스 정책이 destroy 뒤에 남기는 것을 피한 이유를 남긴다.
* **Creation**: [desired_count에 ignore_changes를 두지 않고 data source는 변수로 켠다](decisions/2026-10-desired-count-drift.md) 결정 기록. data source만 running_count를 읽을 수 있고 참조 방식에 따라 읽기가 미뤄진다는 것을 남긴다.
* **Creation**: [nginx default.conf를 파일 하나로 두고 Terraform과 compose가 공유한다](decisions/2026-10-nginx-conf-single-source.md) 결정 기록. heredoc escape와 localhost IPv6 함정을 남긴다.
