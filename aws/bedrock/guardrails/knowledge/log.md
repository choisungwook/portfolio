# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-07

* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) 멀티턴 전체 검사와 latest 비교 결과, guardrail 5개. 시나리오 6 멀티턴 신설로 7~12 번호 변경
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) 고객 문의 대응 단서(key_alias, end_user, x-litellm-call-id)와 콘솔 시각대 함정
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) 차단 근거를 CloudTrail 대신 spend log error_information으로 보는 이유, trail 옵션 기본 false
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) spend log는 남기고 본문은 저장하지 않는 설정(`store_prompts_in_spend_logs: false`)을 명시한 이유
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) LiteLLM guardrail을 1:1 하나에서 시점·스트리밍 방식별 네 개로 나눠, 시나리오 5~8에서 LiteLLM 재기동을 없앤 이유를 추가
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) 지연 시나리오를 input(5)과 output(6)으로 나누고 스트리밍을 7, 8, 비용을 9로 옮긴 문서 경로 갱신.
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) 스트리밍 시나리오를 input(6)과 output(7)으로 나누고 비용을 8로 옮긴 문서 경로 갱신.
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) 시나리오 파일 번호 재배치(4 적용 방법, 5 지연 신설, 6 스트리밍, 7 비용)에 맞춰 문서 경로 갱신.
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) default_on을 기본 구성에 넣지 않은 이유.
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) LiteLLM guardrail을 Bedrock guardrail과 1:1로 줄인 이유와 grounding 옵션을 뺀 이유.
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) during_call 실습 제거와 콘솔용 Postgres 추가 이유.
* **Creation**: [한국어 guardrail은 tier와 리전에 따라 지원 범위가 갈린다](topics/korean-tier-limits.md) tier 비교 중 확인한 서울 리전 grounding과 한국어 word filter의 한계.
* **Creation**: [실습은 콘솔, API, LiteLLM 순서로 같은 guardrail을 호출한다](decisions/2026-11-handson-path-order.md) 시나리오 2를 콘솔과 API 예제로 나누고 각 단계가 부르는 API를 명시한 이유.
* **Update**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) guardrail 관리를 CLI 스크립트에서 Terraform으로 바꾼 이유와 PII 함정 재현 방식 추가.
* **Creation**: [LiteLLM에 붙일 Bedrock guardrail 기본 구성](decisions/2026-11-litellm-guardrail-defaults.md) 결정 기록. 모드별 측정으로 during_call, sampled 스트리밍, PII action 단독 지정을 쓰지 않기로 함.
* **Creation**: [guardrail 비용은 검사 횟수 × 누적 문자 수로 커진다](topics/guardrail-cost-model.md) 비용이 배수로 커지는 경로와 메트릭 해석.
