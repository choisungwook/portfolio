# 슬라이드의 주장을 지표로 확인합니다

[visual-v2.html](visual-v2.html)은 두 장부가 어디서 어긋나는지를 슬라이드로 설명합니다. 그 주장은 제가 `psql`과 AWS CLI로 한 번 재어 본 숫자입니다. 이 문서는 같은 주장을 Prometheus 지표로 다시 확인합니다. 한 화면에서 두 장부를 나란히 질의할 수 있으면, 슬라이드를 믿지 않고 직접 눌러 볼 수 있습니다.

## 두 장부를 각각 어떻게 끌어옵니까

exporter 컨테이너는 하나만 늘어납니다. LiteLLM은 자기 자신이 exporter이기 때문입니다.

| 장부 | 지표를 내는 쪽 | 엔드포인트 | 비용 |
|---|---|---|---|
| LiteLLM | proxy 자신 | `http://localhost:4020/metrics` | 없음. 로컬 호출입니다 |
| Bedrock | `prom/cloudwatch-exporter` | 컨테이너 안 `cloudwatch-exporter:9106` | CloudWatch API 호출당 과금 |

LiteLLM은 `config.yaml`의 `callbacks: ["prometheus"]` 한 줄로 `/metrics`를 엽니다. 이 줄이 없으면 엔드포인트 자체가 붙지 않습니다. v1.99.1 OSS에 들어 있어 enterprise 라이선스가 필요 없습니다.

`/metrics`는 기본으로 인증을 요구합니다. 이 실습은 로컬이라 `require_auth_for_metrics_endpoint: false`로 열어 Prometheus가 토큰 없이 긁게 했습니다. 운영에서는 이 값을 `true`로 두고 Prometheus 쪽에 bearer 토큰을 줍니다. 지표에는 key alias와 team 이름이 들어 있어서 그대로 열어 두면 누가 얼마나 썼는지가 새어 나갑니다.

## 띄우기

[2-setup.md](2-setup.md)의 환경에 Prometheus와 cloudwatch-exporter가 함께 들어 있습니다. 같은 명령으로 뜹니다.

```bash
docker compose up -d
```

Grafana는 `http://localhost:3000`이고 로컬 lab이라 로그인이 꺼져 있습니다. 대시보드 다섯 개가 미리 들어 있습니다.

| 대시보드 | 보는 것 |
|---|---|
| 1. 두 장부 비교 | 같은 호출을 LiteLLM과 Bedrock이 각각 어떻게 세는지 |
| 2. 요청과 호출 | client가 보낸 요청 수와 Bedrock 호출 수의 차이 |
| 3. 같은 요청은 Bedrock을 부르지 않는다 | 캐시 hit이 호출을 막는 구간 |
| 4. 지표 하나에 패널 하나 | 왼쪽 열 LiteLLM, 오른쪽 열 Bedrock을 같은 행끼리 짝지어 하나씩 |
| LiteLLM Prod v2 (공식) | LiteLLM 저장소가 유지하는 운영 대시보드 |

4번은 시나리오 1을 눈으로 확인하려고 만들었습니다. 1번 대시보드와 같은 원리로, 왼쪽 열은 counter의 구간 증가분을 막대로 그리고 오른쪽 열은 최근 10분 구간의 합입니다. 왼쪽 막대 하나가 그 시간대에 실제로 일어난 건수라, 프롬프트를 5번 던지면 그 자리에 5가 섭니다. 시나리오 1은 캐시가 걸리지 않으므로 같은 행의 두 값이 같아야 하고, 캐시 패널은 0으로 남습니다.

캐시 token만 4번 행에 누적 패널을 하나 더 뒀습니다. 구간 막대는 "그때 몇 개 썼는가"를 답하지만 "지금 캐시에 얼마가 살아 있는가"는 답하지 못하기 때문입니다. Bedrock prompt cache의 TTL은 5분이고 읽을 때마다 리셋되므로, 누적 선이 한 번 계단처럼 오른 뒤 평평하면 그 prefix가 계속 살아 있다는 뜻입니다. 선이 다시 오르면 TTL이 지나 새로 쓴 것이고, 그 계단 하나가 1.25배 단가로 청구됩니다.

Prometheus는 `http://localhost:9090`입니다. 두 대상이 모두 붙었는지 먼저 확인합니다. `litellm`은 `up`이고, `bedrock-cloudwatch`는 첫 수집 전까지 `unknown`입니다.

```bash
curl -s localhost:9090/api/v1/targets | jq -r '.data.activeTargets[] | "\(.labels.job) \(.health)"'
```

아래 질의는 Prometheus 화면의 **Graph** 탭에 붙여 넣어도 되고, 명령으로 던져도 됩니다. 이 문서는 명령 형태로 적습니다.

```bash
q() { curl -sG localhost:9090/api/v1/query --data-urlencode "query=$1" | jq -r '.data.result[0].value[1] // "없음"'; }
```

## 관찰하기 전에 두 장부의 시간 축을 맞춥니다

이 실습에서 가장 헷갈리는 부분입니다. 두 지표는 같은 종류의 값이 아닙니다.

- LiteLLM 지표는 **counter**입니다. proxy가 뜬 뒤로 계속 쌓입니다. 그래서 실험 직전에 proxy를 다시 띄우면 counter 값이 곧 실험 전체의 합이 됩니다.
- cloudwatch-exporter가 내는 `aws_bedrock_*_sum`은 **최근 10분 구간의 합**입니다. `observability/cloudwatch.yml`의 `range_seconds: 600`이 그 구간을 정합니다. 시간이 지나면 값이 0으로 떨어집니다.

그래서 실험은 이 순서로 합니다. proxy를 다시 띄워 counter를 0으로 만들고, 시나리오를 돌리고, 10분 안에 양쪽을 읽습니다.

```bash
docker compose restart litellm && sleep 20
for n in 1 2 3 4; do scripts/scenario.sh $n; done
```

더 긴 실험을 하려면 `range_seconds`를 늘립니다. 다만 CloudWatch가 한 번에 돌려주는 구간에는 한계가 있고, 구간을 늘리면 API 호출 비용도 함께 늘어납니다.

counter를 "그 시간에 몇 건"으로 보고 싶을 때 `increase()`나 `rate()`를 먼저 떠올리게 되는데, 이 실험에서는 맞지 않았습니다. 두 함수 모두 구간 양 끝의 sample을 보고 구간 전체를 추정하는데, 이 실험은 요청이 몇 초 안에 몰렸다 끊기는 형태라 추정이 어긋납니다. 제가 20분 구간으로 재 봤더니 53,156이어야 할 값이 44,058로 나왔고, 요청 2건이 든 구간은 1.33으로 나왔습니다.

그래서 대시보드는 추정하지 않는 식을 씁니다. 지금 counter에서 한 구간 전의 counter를 빼면 그 구간에 실제로 늘어난 값만 남습니다. `$__interval`은 Grafana가 패널 폭에 맞춰 넣는 구간 폭이고, `clamp_min`은 proxy를 다시 띄워 counter가 0으로 돌아간 자리에서 음수가 찍히는 것을 막습니다.

```promql
clamp_min(sum(litellm_proxy_total_requests_metric_total) - sum(litellm_proxy_total_requests_metric_total offset $__interval), 0)
```

ALB의 RequestCount를 보듯 막대 하나가 그 시간대의 건수입니다. 프롬프트를 5번 던지면 그 자리에 5가 섭니다. 패널의 min interval은 1분으로 두었습니다. scrape 간격이 15초라 1분이면 sample 네 개가 들어가고, 이보다 좁히면 구간에 sample이 하나도 없는 자리가 생겨 막대가 비어 보입니다.

## 시나리오를 시간으로 가릅니다

Prometheus 지표에는 시나리오 라벨을 붙일 수 없습니다. 세 가지를 시도했고 전부 실패했습니다.

- 요청의 `metadata`에 임의 키를 넣어도 LiteLLM이 버립니다. spend log의 metadata에도 남지 않습니다.
- `custom_prometheus_metadata_labels`는 그 버려진 metadata를 읽으므로 값이 비어 있습니다.
- `custom_prometheus_tags`도 라벨이 붙지 않았습니다. 지표의 라벨 목록은 PrometheusLogger를 만들 때 한 번 굳고(`litellm/integrations/prometheus.py:186`의 주석), 그 시점보다 늦게 설정이 적용되는 것으로 보입니다. 원인을 끝까지 확인하지는 못했습니다.

그래서 시나리오는 시간으로 가릅니다. `run-all.sh`가 캐시를 비우고 counter를 0으로 되돌린 뒤, 시나리오마다 간격을 두고 돌리면서 시작과 끝 시각을 찍습니다. Grafana에서 그 시각으로 구간을 찾습니다.

```bash
GAP=120 scripts/run-all.sh
```

간격 없이 돌리면 네 시나리오가 한 덩어리로 보입니다. 캐시를 비우지 않으면 시나리오 1과 2가 전부 Redis hit이 되어 Bedrock 호출이 0건이 됩니다.

## 슬라이드별로 확인합니다

아래 값은 2026-09-20에 시나리오 1~4를 한 번씩 돌린 뒤 읽은 것입니다. 입력 token은 요청이 정해져 있어 매번 같지만, 출력 token은 모델이 생성하는 길이가 달라져서 실행마다 조금씩 달라집니다.

### 슬라이드 3: Redis hit은 Bedrock에 호출을 만들지 않습니다

요청 23건 중 9건이 Redis에서 끝났다는 주장입니다. LiteLLM의 hit 수와 Bedrock의 호출 수를 함께 봅니다.

```bash
q 'sum(litellm_cache_hits_metric_total)'
q 'sum(aws_bedrock_invocations_sum)'
```

hit 9건, Bedrock 호출 14건입니다. 23에서 9를 빼면 14입니다. 슬라이드의 주장이 그대로 나옵니다.

### 슬라이드 4와 5: 캐시 쓰기와 읽기는 입력과 따로 셉니다

LiteLLM이 캐시 token을 `prompt_tokens`에 합쳐 적는다는 주장입니다. v1.99.1은 그 합친 값과 별개로 provider 캐시 token을 따로 내보내므로, 뺄셈으로 확인할 수 있습니다.

```bash
q 'sum(litellm_input_tokens_metric_total)'
q 'sum(litellm_provider_cache_creation_input_tokens_metric_total)'
q 'sum(litellm_provider_cache_read_input_tokens_metric_total)'
q 'sum(aws_bedrock_cache_write_input_token_count_sum)'
q 'sum(aws_bedrock_cache_read_input_token_count_sum)'
```

캐시 token은 양쪽이 정확히 같습니다. 쓰기 10,502, 읽기 42,008입니다. Bedrock이 세는 값을 LiteLLM이 그대로 받아 적기 때문입니다. 다른 것은 그 값을 어디에 넣느냐입니다.

| 값 | LiteLLM | Bedrock |
|---|---|---|
| 캐시 쓰기 10,502 | `input_tokens`에 포함 | `cache_write_input_token_count`에만 |
| 캐시 읽기 42,008 | `input_tokens`에 포함 | `cache_read_input_token_count`에만 |
| 합계 | 53,156 | `input_token_count` 406 |

### input token 차이를 뺄셈 하나로 좁힙니다

이 실습의 핵심 질의입니다. LiteLLM input에서 캐시 token 두 종류를 빼면 Bedrock의 input에 가까워져야 합니다.

```bash
q 'sum(litellm_input_tokens_metric_total)
   - sum(litellm_provider_cache_read_input_tokens_metric_total)
   - sum(litellm_provider_cache_creation_input_tokens_metric_total)'
q 'sum(aws_bedrock_input_token_count_sum)'
```

53,156에서 캐시 token을 빼면 646이고, Bedrock의 input은 406입니다. 240만큼 남습니다. 이 나머지가 [3-scenarios.md](3-scenarios.md)에서 `report-input-gap.sh`로 쪼갠 마지막 두 조각입니다.

| 조각 | token | 왜 남는가 |
|---|---|---|
| 응답 캐시 hit의 usage 재기록 | 243 | Bedrock을 부르지 않은 요청이라 저쪽에는 없습니다 |
| 끊긴 스트림의 추정 오차 | −3 | LiteLLM이 96으로 추정했고 Bedrock은 99를 셌습니다 |

즉 `53,156 − 42,008 − 10,502 − 243 + 3 = 406`입니다. 두 장부의 input이 131배 차이 나는 이유가 이 한 줄로 닫힙니다.

### 슬라이드 6: 끊긴 스트림은 output이 반대로 어긋납니다

output은 LiteLLM이 적게, Bedrock이 많게 나온다는 주장입니다.

```bash
q 'sum(litellm_output_tokens_metric_total)'
q 'sum(aws_bedrock_output_token_count_sum)'
```

LiteLLM 2,105, Bedrock 2,655입니다. 두 가지가 반대 방향으로 섞인 결과입니다.

| 시나리오 | LiteLLM | Bedrock | 원인 |
|---|---|---|---|
| 2 (Redis hit) | 1,840 | 184 | 저장한 응답을 열 번 다시 적습니다 |
| 4 (스트림 중단) | 194 | 2,400 | 끊어도 `max_tokens` 800까지 생성합니다 |

시나리오 1과 3은 양쪽이 같으므로, `41 + 184 + 30 + 2,400 = 2,655`로 Bedrock 값이 맞아떨어집니다.

## 비용

CloudWatch 지표 조회는 공짜가 아닙니다. `GetMetricStatistics`는 1,000회당 $0.01입니다. `observability/prometheus.yml`에서 이 대상만 5분 주기로 묶어 둔 이유입니다. 지표 5개를 5분마다 읽으면 하루 1,440회로 $0.015 정도입니다.

주기를 15초로 당기면 하루 28,800회가 되어 $0.29입니다. 실습이 끝나면 스택을 내려서 이 호출을 멈춥니다.

```bash
docker compose down
```

## AWS는 이렇게 보라고 합니다

AWS 문서가 이 실습의 결론을 그대로 적어 두었습니다. `InputTokenCount`의 정의가 "모델이 처리한 입력 token 수, **캐시된 token은 제외**"이고, 쿼터에 잡히는 입력을 알려면 `InputTokenCount + CacheWriteInputTokenCount`를 더하라고 합니다. LiteLLM이 `prompt_tokens` 하나로 합쳐 적는 값을 AWS는 셋으로 나눠 두는 것입니다.

AWS가 제시하는 관찰 수단은 셋입니다.

| 수단 | 보는 단위 | 준비 |
|---|---|---|
| CloudWatch **Automatic dashboards → Bedrock** | 모델별 token 합계 (`Token Counts by Model`) | 없음. 바로 열립니다 |
| CloudWatch **GenAI observability → Model Invocations** | 요청 단위. Request ID로 입력·출력 본문까지 | Bedrock 설정에서 model invocation logging을 켭니다 |
| 직접 만든 CloudWatch 대시보드 | 원하는 지표 조합 | `scripts/cloudwatch-dashboard.sh` |

첫 번째가 가장 빠릅니다. CloudWatch 콘솔에서 **Dashboards → Automatic dashboards → Bedrock**으로 들어가면 됩니다. 다만 여기에는 캐시 token 위젯이 없어서 이 실습이 보려는 네 종류가 한 화면에 모이지 않습니다.

그래서 네 종류를 모은 대시보드를 따로 만듭니다. 위젯 8개이고 CloudWatch 대시보드는 계정당 3개까지 무료입니다. 앞의 5개는 지표 하나에 위젯 하나이고, 뒤의 3개에서만 지표를 섞습니다.

```bash
AWS_PROFILE=<프로파일> scripts/cloudwatch-dashboard.sh
```

`report-aws.sh`의 시각 계산은 macOS의 BSD date와 Linux의 GNU date에서 옵션이 달라 둘 다 받도록 감싸 두었습니다.

`max_tokens`에 대한 AWS의 설명은 시나리오 4와 직접 이어집니다. 요청을 받을 때 `전체 입력 token + max_tokens`가 먼저 쿼터에서 빠지고, 끝난 뒤에 실제 사용량으로 조정됩니다. 그래서 `max_tokens`를 크게 잡으면 청구는 실제 사용량만 되더라도 쿼터는 미리 잠깁니다. AWS는 `max_tokens`를 실제 응답 길이에 맞춰 줄이라고 권합니다.

## 이 실습으로 확인되지 않는 것

- **금액**입니다. `litellm_spend_metric_total`은 LiteLLM이 자기 가격표로 계산한 값이고, CloudWatch에는 금액 지표가 없습니다. 청구 금액은 Cost Explorer에서 하루 뒤에 확인합니다.
- **요청 단위 대조**입니다. CloudWatch는 모델 단위 합계만 줍니다. 어느 요청이 어긋났는지는 `LiteLLM_SpendLogs`를 봐야 합니다.
- **`litellm_cache_misses_metric_total`의 의미**입니다. 이번 실행에서 3으로 나왔는데, 요청 23건 중 Redis를 거친 건수와 맞지 않습니다. 시나리오 3과 4는 `cache: {"no-cache": true}`로 캐시를 건너뛰어 miss로도 세지 않는 것으로 보입니다. 확인하지 못했으므로 hit 수만 근거로 씁니다.
