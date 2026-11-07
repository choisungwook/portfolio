# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [LiteLLM에 붙일 Bedrock guardrail 기본 구성](2026-11-litellm-guardrail-defaults.md) - Bedrock guardrail 하나를 가리키는 LiteLLM guardrail 여섯 개. 입력은 pre_call + 마스킹, 출력은 buffered, PII는 방향별 action 명시.
* [실습은 콘솔, API, LiteLLM 순서로 같은 guardrail을 호출한다](2026-11-handson-path-order.md) - 문서는 스크립트 대신 호출 API를 명시하고 콘솔 테스트부터 시작.
