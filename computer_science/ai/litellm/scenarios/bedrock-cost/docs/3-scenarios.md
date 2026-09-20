# 시나리오를 돌리고 두 숫자를 나란히 적습니다

환경은 [2-setup.md](2-setup.md)로 준비합니다. 시나리오마다 가설을 먼저 적고, 실행한 뒤 두 쪽 숫자를 기록표에 옮깁니다. 가설이 맞는 이유는 [4-why-different.md](4-why-different.md)에 있습니다.

## 숫자를 읽는 두 명령

LiteLLM 쪽 숫자는 Postgres의 `LiteLLM_SpendLogs`에서 읽습니다. proxy가 spend log를 모아서 쓰므로 요청 뒤 10초쯤 기다립니다.

```bash
scripts/report-litellm.sh
```

Bedrock 쪽 token과 호출 수는 CloudWatch `AWS/Bedrock` 지표에서 읽습니다. 지표는 몇 분 늦게 들어옵니다. 시나리오별로 구분되지 않으므로 시나리오를 하나 돌릴 때마다 실행해 직전 값과의 차이를 적습니다.

```bash
scripts/report-aws.sh
```

청구 금액은 Cost Explorer에 하루쯤 뒤에 나타납니다. `report-aws.sh`가 마지막에 출력하는 `aws ce get-cost-and-usage` 명령을 다음 날 실행합니다. 금액을 기다리지 않아도 token 비교로 원인은 드러납니다. 금액은 token에 단가를 곱한 값이기 때문입니다.

## 비용은 Bedrock 호출에서만 발생합니다

LiteLLM proxy는 돈을 쓰지 않습니다. 요청이 Bedrock에 닿아야 과금이 시작됩니다. 그래서 시나리오마다 "Bedrock을 부르는 요청"과 "부르지 않는 요청"을 나눠서 봐야 합니다.

Bedrock은 token을 네 종류로 나눠 과금합니다. 아래는 `global.anthropic.claude-sonnet-4-6`의 단가이고 100만 token당 금액입니다.

| token 종류 | 단가 | 언제 발생하나 |
|---|---|---|
| 입력 | $3.00 | 캐시에 걸리지 않은 입력 |
| 캐시 쓰기 | $3.75 | `cache_control`을 붙인 구간을 처음 보낼 때. 일반 입력보다 25% 비쌉니다 |
| 캐시 읽기 | $0.30 | 같은 구간을 5분 안에 다시 보낼 때. 일반 입력의 10분의 1입니다 |
| 출력 | $15.00 | 모델이 생성한 token. 가장 비쌉니다 |

이 실험 전체에서 돈이 가장 많이 나간 요청은 시나리오 3의 첫 요청 하나입니다. $0.0396으로 전체 $0.0606의 65%입니다. 캐시 쓰기 10,502 token이 거기서 발생합니다.

아래 시나리오마다 요청 하나를 `curl`로 먼저 보여 주고, 반복은 스크립트로 돌립니다. **`curl` 예시는 시나리오를 이루는 여러 요청 중 한 건입니다.** 그래서 `curl` 한 번의 `usage`와 시나리오 합계는 다릅니다.

숫자를 비교할 때 두 가지를 구분합니다.

- **입력 token은 매번 같습니다.** 요청 본문이 정해져 있어서 몇 번을 돌려도 값이 바뀌지 않습니다. 시나리오 1은 요청마다 29이고 5건이면 145입니다.
- **출력 token은 실행마다 다릅니다.** 모델이 생성하는 길이가 매번 달라집니다. 시나리오 1의 5건 합계를 세 번 재어 보니 59, 56, 41이었습니다. 그래서 spend도 조금씩 달라집니다.

아래 금액은 2026-09-20 첫 측정값입니다. 똑같이 나오지 않아도 맞습니다. 입력 token과 호출 수가 어긋나면 그때 원인을 찾습니다. `curl` 예시는 `.env`를 읽은 셸에서 실행합니다. 스크립트는 `LITELLM_KEY`가 있으면 예산 상한이 걸린 virtual key를, 없으면 master key를 씁니다.

```bash
set -a; source .env; set +a
```

## 시나리오 1: 캐시가 없으면 두 숫자는 맞아야 합니다

가설: 요청 5건, Bedrock `Invocations` 5, `prompt_tokens` 합과 `InputTokenCount`가 같고 `completion_tokens` 합과 `OutputTokenCount`가 같습니다.

질문을 매번 바꿔 보냅니다. 질문이 다르면 LiteLLM의 cache key가 달라져 5건 모두 Bedrock에 닿습니다.

```bash
curl -s http://localhost:4020/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet","max_tokens":50,"metadata":{"tags":["s1"]},
       "messages":[{"role":"user","content":"숫자 1 의 제곱을 한 단어로 답해"}]}' | jq .
```

다섯 번을 한 번에 보냅니다.

```bash
scripts/scenario.sh 1
```

위 `curl` 한 건의 응답은 `prompt_tokens` 29, `completion_tokens` 13처럼 나옵니다. 시나리오는 이런 요청 5건이므로 합계는 그 5배 구간입니다.

비용은 5건 모두에서 발생합니다. 입력은 29 × 5 = 145로 고정이고, 출력은 실행마다 달라집니다. 첫 측정에서 출력 합계가 59였고 단가를 곱하면 그때의 spend와 같습니다.

```text
145 × $3.00 + 59 × $15.00 = $0.000435 + $0.000885 = $0.001320   (100만 token당 단가)
```

출력이 56인 실행에서는 $0.001275가 나왔습니다. 입력 145가 그대로면 정상입니다.

기준선이 어긋나면 뒤 시나리오를 해석할 수 없습니다. 어긋날 때는 같은 계정에서 다른 호출이 같은 모델을 쓰고 있는지, `AWS_REGION_NAME`과 `report-aws.sh`의 리전이 같은지부터 봅니다.

## 시나리오 2: 첫 요청만 돈을 쓰고 나머지 아홉 건은 공짜입니다

가설: LiteLLM 요청 10건 중 9건이 `cache_hit`입니다. Bedrock `Invocations`는 1만 늘어납니다. spend는 1건어치인데 `prompt_tokens`와 `completion_tokens` 합은 10건어치입니다.

똑같은 질문을 열 번 보냅니다. 요청 본문이 한 글자도 다르지 않아야 cache key가 같습니다.

```bash
curl -s http://localhost:4020/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet","max_tokens":200,"metadata":{"tags":["s2"]},
       "messages":[{"role":"user","content":"TCP 3-way handshake를 세 문장으로 설명해"}]}'
```

열 번을 한 번에 보냅니다.

```bash
scripts/scenario.sh 2
```

비용이 나는 요청은 첫 번째 하나입니다. Redis가 비어 있어 Bedrock까지 갑니다.

| 요청 | Redis | Bedrock 호출 | 비용 |
|---|---|---|---|
| 1번째 | miss | 있음 | 입력 27 × $3.00 + 출력 200 × $15.00 = $0.003081. 출력은 실행마다 다릅니다 |
| 2~10번째 | hit | 없음 | $0 |

응답 10개의 `usage`가 전부 같은 값인지 봅니다. 캐시 hit은 저장해 둔 응답을 `usage`까지 그대로 돌려줍니다. 금액 기준 집계는 청구서와 맞고, token 기준 집계는 청구서의 10배가 됩니다.

다시 돌리려면 Redis를 비웁니다. 비우지 않으면 첫 요청도 hit이 되어 Bedrock 호출이 0건이 됩니다.

```bash
docker compose exec redis redis-cli FLUSHALL
```

## 시나리오 3: 첫 요청이 가장 비싸고 다음 네 건은 10분의 1입니다

가설: 첫 호출은 `cache_creation_input_tokens`가, 나머지 4건은 `cache_read_input_tokens`가 약 10,500입니다. LiteLLM `prompt_tokens`는 5건 모두 10,500을 넘습니다. Bedrock `InputTokenCount`는 5건을 합쳐도 100 안쪽이고, 나머지는 캐시 쓰기 지표와 캐시 읽기 지표에 따로 쌓입니다. `report-aws.sh`는 이 모델에 쌓인 token 지표를 이름과 함께 전부 출력합니다.

system prompt를 크게 만들고 그 구간에 `cache_control`을 붙입니다. 이 표시가 Bedrock의 `cachePoint`로 번역되어 캐시가 동작합니다. 질문만 매번 바꿔서 LiteLLM 응답 캐시에는 걸리지 않게 하고, `cache:{"no-cache":true}`로 Redis를 한 번 더 막습니다.

```bash
SYS=$(printf '%.0s이 문장은 prompt caching 최소 길이를 넘기기 위한 채움 문장입니다. ' $(seq 300))
curl -s http://localhost:4020/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d "$(jq -n --arg sys "$SYS" '{model:"claude-sonnet", max_tokens:50, metadata:{tags:["s3"]},
        cache:{"no-cache":true},
        messages:[{role:"system",content:[{type:"text",text:$sys,cache_control:{type:"ephemeral"}}]},
                  {role:"user",content:"숫자 1 을 영어로 한 단어로 답해"}]}')"
```

다섯 번을 한 번에 보냅니다.

```bash
scripts/scenario.sh 3
```

비용은 5건 모두에서 발생하지만 크기가 12배 차이 납니다. 첫 요청은 캐시에 쓰고, 나머지는 읽습니다.

| 요청 | 캐시 동작 | 비용 |
|---|---|---|
| 1번째 | 쓰기 10,502 | 27 × $3.00 + 10,502 × $3.75 + 6 × $15.00 = $0.039554 |
| 2~5번째 | 읽기 10,502 | 27 × $3.00 + 10,502 × $0.30 + 6 × $15.00 = $0.003322 씩 |

캐시를 쓰지 않았다면 5건 모두 10,529 token을 정가로 냈을 것입니다. $0.158이 나옵니다. 캐시가 이 시나리오의 비용을 3분의 1로 줄였습니다.

spend가 맞는지는 손으로 검산합니다. `prompt_tokens × $3`으로 계산하면 실제보다 크게 나옵니다. 세 단가를 나눠 곱해야 합니다.

```text
spend = 캐시 아닌 입력 × 3.00 + 캐시 쓰기 × 3.75 + 캐시 읽기 × 0.30 + 출력 × 15.00   (100만 token당 $)
```

첫 호출에서 캐시 쓰기가 0이면 system prompt가 모델의 최소 캐시 길이에 못 미친 것입니다. `scenario.sh`의 반복 횟수 300을 늘립니다. 5분 안에 시나리오를 다시 돌리면 첫 호출도 캐시 읽기가 됩니다. Bedrock prompt cache의 TTL이 5분이기 때문입니다.

## 시나리오 4: 끊어도 max_tokens만큼 냅니다

가설: Bedrock은 클라이언트가 끊을 때까지 생성한 출력 token을 과금합니다. LiteLLM v1.99.1은 끊기기 전에 받은 chunk로 부분 응답을 조립해 spend를 남깁니다. 끊긴 스트림에는 `usage`가 실린 마지막 chunk가 없으므로 LiteLLM은 token을 로컬 tokenizer로 추정합니다. 두 값은 가깝지만 같지 않습니다.

길게 답할 질문을 `stream: true`로 보내고 2초 만에 끊습니다. `--max-time 2`가 끊는 역할을 합니다.

```bash
curl -sN --max-time 2 http://localhost:4020/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet","max_tokens":800,"stream":true,"metadata":{"tags":["s4"]},
       "cache":{"no-cache":true},
       "messages":[{"role":"user","content":"Kubernetes 스케줄러 동작을 아주 길게 설명해"}]}'
```

세 번을 한 번에 보냅니다.

```bash
scripts/scenario.sh 4
```

비용은 3건 모두에서 발생하고, 여기서만 두 장부의 금액이 어긋납니다. 끊은 시점이 아니라 `max_tokens`가 금액을 정합니다.

| 세는 쪽 | 출력 token | 금액 |
|---|---|---|
| LiteLLM (받은 chunk에서 추정) | 205 | 96 × $3.00 + 205 × $15.00 = $0.003363 |
| Bedrock (실제 생성) | 2,400 | 99 × $3.00 + 2,400 × $15.00 = $0.036297 |

`report-litellm.sh`에서 `s4` 행이 3건인지, `completion_tokens`가 0이 아닌지 봅니다. 그다음 `OutputTokenCount` 증가분과 비교합니다. 실행 결과 Bedrock은 끊긴 뒤에도 `max_tokens`까지 생성했습니다. 아래 기록표의 4번 행입니다.

`max_tokens`를 800에서 200으로 낮추고 다시 돌리면 Bedrock 쪽 금액이 4분의 1로 줄어드는 것을 볼 수 있습니다. 스트림을 자주 끊는 클라이언트가 많은 환경에서 `max_tokens`가 청구를 좌우한다는 뜻입니다.

## 기록표

2026-09-20, `us-east-1`에서 한 번씩 돌린 값입니다. Bedrock 쪽은 CloudWatch 지표의 증가분이고, Bedrock 금액은 그 token에 v1.99.1 가격표 단가를 곱한 값입니다. Cost Explorer 금액은 다음 날 채웁니다(확인 필요).

| 시나리오 | LiteLLM 요청 | Bedrock Invocations | LiteLLM prompt_tokens | Bedrock Input + CacheRead + CacheWrite | LiteLLM completion_tokens | Bedrock OutputTokenCount | LiteLLM spend | Bedrock token × 단가 |
|---|---|---|---|---|---|---|---|---|
| 1 | 5 | 5 | 145 | 145 + 0 + 0 | 59 | 59 | $0.001320 | $0.001320 |
| 2 | 10 (hit 9) | 1 | 270 | 27 + 0 + 0 | 2,000 | 200 | $0.003081 | $0.003081 |
| 3 | 5 | 5 | 52,645 | 135 + 42,008 + 10,502 | 30 | 30 | $0.052840 | $0.052840 |
| 4 | 3 | 3 | 96 | 99 + 0 + 0 | 205 | 2,400 | $0.003363 | $0.036297 |
| 합계 | 23 | 14 | 53,156 | 406 + 42,008 + 10,502 = 52,916 | 2,294 | 2,689 | $0.060604 | $0.093538 |

읽는 법은 세 가지입니다.

- 시나리오 1, 2, 3은 금액이 소수 여섯째 자리까지 같습니다. token 컬럼만 다릅니다. 시나리오 2의 `completion_tokens`는 10배, 시나리오 3의 `prompt_tokens`는 Bedrock `InputTokenCount`의 390배입니다.
- 시나리오 4는 금액이 다릅니다. 클라이언트는 2초에 끊었지만 Bedrock `OutputTokenCount`는 3건 모두 `max_tokens`인 800까지 올라갔습니다. LiteLLM은 끊기기 전에 받은 chunk에서 205 token을 추정했습니다. Bedrock 쪽 금액이 LiteLLM spend의 10.8배입니다.
- 합계 금액은 Bedrock 쪽이 54% 큽니다. 차이 $0.032934는 전부 시나리오 4에서 나왔습니다.

## input token 차이는 네 조각으로 쪼개집니다

Cost Explorer의 Bedrock input token 줄은 캐시되지 않은 입력만 셉니다. 캐시 읽기와 캐시 쓰기는 별도 usage type입니다. LiteLLM `prompt_tokens` 합을 같은 기준으로 쪼개는 스크립트입니다. 캐시 token 수는 `LiteLLM_SpendLogs.metadata`의 `usage_object`에서 읽습니다.

```bash
scripts/report-input-gap.sh
```

이번 실행의 결과입니다.

| 조각 | token | Cost Explorer에서의 위치 |
|---|---|---|
| `billable_input` | 403 | input token usage type. CloudWatch `InputTokenCount`는 406 |
| `bedrock_cache_read` | 42,008 | 캐시 읽기 usage type |
| `bedrock_cache_write` | 10,502 | 캐시 쓰기 usage type |
| `litellm_cache_hit_replay` | 243 | 없음. Bedrock을 부르지 않은 요청 |
| `failed_estimate` | 0 | 없음. 실패한 요청의 추정값 |
| `litellm_prompt_tokens` 합 | 53,156 | |

`billable_input`과 `InputTokenCount`의 차이 3은 시나리오 4의 추정 오차입니다. 이 실험은 system prompt를 일부러 크게 잡아서 비율이 극단적입니다. 운영 환경에서 LiteLLM input token이 40% 많다면 네 조각 중 `billable_input`이 아닌 것의 합이 `billable_input`의 40%라는 뜻입니다. 어느 조각이 큰지에 따라 원인이 갈립니다.

- `bedrock_cache_read`와 `bedrock_cache_write`가 크면 비교 대상을 잘못 잡은 것입니다. Cost Explorer에서 캐시 읽기와 캐시 쓰기 usage type의 수량을 input에 더하면 맞습니다. 청구 금액은 어긋나지 않습니다.
- `litellm_cache_hit_replay`가 크면 LiteLLM 응답 캐시의 hit 비율이 그만큼입니다. 요청 중 29%가 hit이면 token 합이 40% 많아집니다.
- `failed_estimate`가 크면 실패 요청(throttling, 인증 오류)이 많은 것입니다.

Cost Explorer의 금액은 usage type 단위로 하루치가 합쳐져 나옵니다. 시나리오별 금액이 필요하면 하루에 시나리오 하나만 돌립니다. 요청 단위 대조가 필요하면 Bedrock model invocation logging을 켜서 요청별 token을 CloudWatch Logs로 받습니다. 이 핸즈온은 거기까지 가지 않습니다.
