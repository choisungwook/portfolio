# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [ECS·Lambda 불가 확인은 실제 리소스 없이 가짜 ID로 한다](2026-11-unsupported-targets-without-resources.md) - InstanceId 형식 검증에서 먼저 거부되므로 리소스를 만들지 않음.
