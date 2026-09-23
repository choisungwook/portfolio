# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-09-23

* **Creation**: [LiteLLM 수집기는 replica sidecar가 아니라 계정당 task 1개로 둔다](decisions/2026-09-collector-per-account.md) 결정 기록. 수집 구조를 바꿀 때 sidecar로 되돌아가지 않도록 남긴다.
* **Creation**: [3계정 terraform은 mock provider plan 테스트로 먼저 검증한다](decisions/2026-09-terraform-mock-plan-test.md) 결정 기록. validate만으로 놓친 버그 두 개를 plan 테스트로 잡아 남긴다.
