# Amazon Bedrock Guardrails와 LiteLLM Proxy

LiteLLM gateway에 Bedrock guardrail을 붙여 모델과 무관하게 입력과 출력을 검사하고, 검사 시점과 스트리밍 방식에 따른 지연, 유출, 비용을 측정하는 핸즈온입니다.

## 문서

| 순서 | 문서 | 내용 |
|---|---|---|
| 0 | [setup.md](./docs/setup.md) | guardrail 생성, LiteLLM 기동, 정리 |
| - | [handson-guide.md](./docs/handson-guide.md) | 시나리오 순서, 단계별 확인 값, 셸 복구, 시나리오 사이 설정 전환 |
| 1 | [1-feature-map.md](./docs/1-feature-map.md) | 가드레일 기능 지도, 용어, 대안 비교 |
| 2 | [2-policy-filters.md](./docs/2-policy-filters.md) | 콘솔 테스트와 ApplyGuardrail API 직접 호출로 정책 판정, PII 입력 마스킹 함정, 버전 고정 확인 |
| 3 | [3-litellm-guardrail-modes.md](./docs/3-litellm-guardrail-modes.md) | LiteLLM 콘솔과 API로 연동 확인. pre, post 시점, 마스킹 경로, 멀티턴 비용, fail-closed, grounding |
| 4 | [4-litellm-guardrail-apply.md](./docs/4-litellm-guardrail-apply.md) | guardrail을 요청 파라미터로 거는 방법과 `default_on`으로 모든 요청에 거는 방법, key 단위 예외 |
| 5 | [5-latency-input-guardrail.md](./docs/5-latency-input-guardrail.md) | input guardrail이 모델 호출 앞에 더하는 지연과 모델을 부르지 않는 빠른 차단 |
| 6 | [6-multiturn-guardrail.md](./docs/6-multiturn-guardrail.md) | 멀티턴 대화에서 input guardrail이 매번 대화 전체를 검사해 unit과 시간이 늘어나는 것, 마지막 메시지만 검사하는 옵션의 대가, 세션 기반 증분 검사(only_scan_new_messages) |
| 7 | [7-latency-output-guardrail.md](./docs/7-latency-output-guardrail.md) | output guardrail이 모델 응답 뒤에 더하는 지연, 모델 시간을 다 쓰는 차단, 둘을 함께 건 지연 |
| 8 | [8-streaming-input-guardrail.md](./docs/8-streaming-input-guardrail.md) | 스트리밍 요청에서 input guardrail이 첫 글자만 늦추고 리듬은 유지, 출력은 검사하지 않음 |
| 9 | [9-streaming-output-guardrail.md](./docs/9-streaming-output-guardrail.md) | 스트리밍 output guardrail의 buffered, release 원리와 차단 신호, 제공자 내장 검사 비교 |
| 10 | [10-cost-and-monitoring.md](./docs/10-cost-and-monitoring.md) | text unit 비용 계산, CloudWatch 메트릭, CloudTrail |
| 11 | [11-litellm-console-monitoring.md](./docs/11-litellm-console-monitoring.md) | LiteLLM 콘솔 Guardrails Monitor로 guardrail별 통과, 차단 집계. spend log는 남기고 본문은 저장하지 않음 |
| 12 | [12-find-customer-blocked-request.md](./docs/12-find-customer-blocked-request.md) | 고객 문의로 차단 시각과 근거 찾기. 콘솔 Logs 필터와 `GET /spend/logs/ui` |
| - | [support-runbook.md](./docs/support-runbook.md) | LiteLLM 사용자 문의 대응 런북. 차단 시각, 오탐, guardrail 이름 오타, PII 전달, 스트리밍 도중 차단, 차단 요청 비용 |
| - | [troubleshooting.md](./docs/troubleshooting.md) | 실습 중 겪은 문제 |

## 디렉터리

| 경로 | 내용 |
|---|---|
| `compose.yaml` | LiteLLM Proxy v1.108.2, 콘솔용 Postgres |
| `litellm/config.yaml` | 모델 3개, LiteLLM guardrail 6개(검사 시점, 검사 범위, 스트리밍 방식별, 모두 같은 Bedrock guardrail을 가리킴) |
| `terraform/` | Bedrock guardrail과 버전 1. `enable_guardrail_data_events`(기본 false)로 ApplyGuardrail 데이터 이벤트 trail을 선택해 만듦 |
| `scripts/*.sh` | 정책 판정 표, 메트릭 조회, 호출 헬퍼 |
| `scripts/stream_probe.py` | 스트리밍 응답 측정 |
| `.python-version` | `uv run`이 쓸 Python 버전. 홈 디렉터리의 pyenv 설정보다 먼저 읽힘 |
| `imgs/` | 시나리오별 구조와 흐름 그림 |
