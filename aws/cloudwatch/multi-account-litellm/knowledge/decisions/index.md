# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [LiteLLM 수집기는 replica sidecar가 아니라 계정당 task 1개로 둔다](2026-09-collector-per-account.md) - sidecar는 instance label이 모든 replica에서 같아 counter가 섞인다.
* [3계정 terraform은 mock provider plan 테스트로 먼저 검증한다](2026-09-terraform-mock-plan-test.md) - validate가 놓친 이름 길이와 unknown count 문제를 자격 증명 없이 잡는다.
