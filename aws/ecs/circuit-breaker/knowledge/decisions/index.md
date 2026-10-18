# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [revision과 circuit breaker는 콘솔이 소유하고 Terraform은 ignore_changes한다](2026-10-console-owned-circuit-breaker.md) - 콘솔 변경과 ECS 가중치 변경을 apply가 되돌리지 않게 하고, 임계치는 CLI로 바꾼다.
