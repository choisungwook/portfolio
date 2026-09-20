# LiteLLM spend와 Bedrock 청구서는 같은 호출을 다르게 셉니다

LiteLLM proxy 뒤에 Bedrock을 두면 비용 숫자가 두 곳에 생깁니다. LiteLLM의 spend log와 AWS의 Cost Explorer(또는 CUR, Cost and Usage Report)입니다. 두 숫자는 같은 호출을 가리키지만 같은 값이 아닙니다. 이 핸즈온은 어디서, 얼마나, 왜 달라지는지를 $5 안쪽의 호출로 직접 확인합니다.

출발점은 LiteLLM이 보여주는 input token이 Cost Explorer의 Bedrock input token보다 40%쯤 많게 나온 경험입니다. 금액보다 token 수가 먼저 어긋났습니다. 그래서 시나리오는 "LiteLLM `prompt_tokens`에는 있고 Bedrock의 input token usage type에는 없는 token이 무엇인가"를 하나씩 분리합니다.

## 두 숫자는 만드는 주체와 재료가 다릅니다

| | LiteLLM spend | AWS 청구 |
|---|---|---|
| 계산 주체 | LiteLLM proxy | AWS billing |
| token 수의 출처 | Bedrock 응답의 `usage` 블록 | Bedrock이 서버에서 센 값 |
| 단가의 출처 | `model_prices_and_context_window.json` | AWS 요금표 |
| 기록 단위 | LiteLLM이 받은 요청 1건 | Bedrock이 처리한 호출, usage type별 합계 |
| 보이는 시점 | 수 초 뒤 | CloudWatch 지표는 수 분, Cost Explorer는 하루쯤 뒤 |

LiteLLM은 청구서를 읽지 않습니다. 응답에 실려 온 token 수에 자기 가격표의 단가를 곱합니다. 그래서 차이는 세 군데에서 생깁니다. 요청 수가 다르거나, token을 묶는 방식이 다르거나, 단가가 다릅니다.

## 시나리오 네 개가 차이를 하나씩 분리합니다

| 시나리오 | 조작 | 확인하는 차이 |
|---|---|---|
| 1. 기준선 | 서로 다른 짧은 질문 5개 | 캐시가 없으면 호출 수, token, 금액이 맞는가 |
| 2. LiteLLM 응답 캐시 | 같은 요청 10번 | LiteLLM 요청 10건, Bedrock 호출 1건. 캐시 hit 행의 token과 spend |
| 3. Bedrock prompt caching | `cache_control`을 붙인 큰 system prompt로 5번 | LiteLLM `prompt_tokens`와 Bedrock `InputTokenCount`가 세는 범위 |
| 4. 스트리밍 중단 | 2초 뒤 클라이언트가 연결을 끊음 | Bedrock이 과금한 출력 token이 spend log에 남는가 |

시나리오 1이 맞아야 나머지 차이를 캐시와 중단 탓으로 돌릴 수 있습니다. 그래서 1번을 먼저 돌립니다.

## 전체 비용은 $0.2 안쪽입니다

모델은 `global.anthropic.claude-sonnet-4-6`입니다. v1.99.1 가격표 기준 단가는 입력 $3, 출력 $15, 캐시 쓰기 $3.75, 캐시 읽기 $0.30(모두 100만 token당)입니다.

| 시나리오 | 상한 계산 | 상한 |
|---|---|---|
| 1 | 5회 × (입력 약 30 + 출력 50) | $0.005 |
| 2 | Bedrock 1회 × (입력 약 40 + 출력 200) | $0.004 |
| 3 | 캐시 쓰기 약 10,500 + 캐시 읽기 4 × 10,500 | $0.06 |
| 4 | 3회 × 출력 800 | $0.04 |

네 개를 한 번씩 돌리면 $0.1, 열 번을 반복해도 $1입니다. 2026-09-20 실측은 $0.0935였고, 그중 65%가 시나리오 3의 첫 요청 하나에서 나왔습니다. Cost Explorer API는 호출 한 번에 $0.01입니다. [2-setup.md](2-setup.md)에서 만드는 virtual key에는 `max_budget: 4`를 겁니다. 이 상한은 LiteLLM이 계산한 spend 기준이라 이 핸즈온이 의심하는 바로 그 숫자입니다. 청구 기준 상한이 필요하면 AWS Budgets를 따로 겁니다.

## 읽는 순서

1. [2-setup.md](2-setup.md)로 환경을 띄웁니다.
2. [3-scenarios.md](3-scenarios.md)로 시나리오를 돌리고 두 숫자를 나란히 적습니다.
3. [4-why-different.md](4-why-different.md)에서 LiteLLM 소스와 이력으로 차이의 원인을 확인합니다.
4. [6-observe.md](6-observe.md)에서 같은 차이를 Prometheus 지표로 다시 확인합니다.
