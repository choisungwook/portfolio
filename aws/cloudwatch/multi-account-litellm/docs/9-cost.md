# 비용 계산

방안별 월 비용을 ap-northeast-2 단가와 로컬 측정값으로 계산한다. 계산기는 [scripts/cost.py](../scripts/cost.py)다.

## 결론

- 기준 시나리오에서는 방안 A가 가장 낮고 방안 4가 가장 높다. 차이는 월 136 USD다
- series가 10배 가까이 늘면 순위가 바뀐다. 고정비 구조인 방안 3만 거의 그대로다
- 어느 방안이든 LiteLLM 설정에서 histogram 4종과 label 2개를 빼면 series가 약 40% 줄어든다

## 계산기 실행

기준·대규모 시나리오를 Markdown 표로 출력한다.

```bash
uv run scripts/cost.py
```

규모를 바꿔 본다. 인자를 주면 그 값으로 한 시나리오만 출력한다.

```bash
uv run scripts/cost.py --prod-replicas 6 --prod-combos 300 --viewers 30
uv run scripts/cost.py --slim
```

## 가정

| 항목 | 기준 | 대규모 |
|---|---|---|
| replica | dev 1, prod 3 | dev 1, prod 6 |
| replica 하나가 받는 key×model 조합 | dev 15, prod 60 | dev 40, prod 300 |
| team, model | 10, 6 | 10, 6 |
| scrape 간격 | 30초 | 30초 |
| LiteLLM 로그 | dev 0.2GB/일, prod 1GB/일 | 같음 |
| Grafana 사용자 | editor 2, viewer 10 | editor 4, viewer 30 |
| 보관 | 90일 | 90일 |

## 측정값

LiteLLM v1.102.1을 로컬에서 띄우고 mock 모델에 team 3개, key 4개, model 3개를 섞어 요청을 보내 측정했다.

| 측정 | 값 | 방법 |
|---|---:|---|
| replica 하나의 기본 series | 28 | key label이 없는 series 수 |
| 조합 하나가 만드는 series | 89 | key label이 있는 series 1,068개 ÷ 성공 조합 12개 |
| 조합 하나가 만드는 series(slim) | 52 | 아래 설정 적용 후 624개 ÷ 12개 |
| OTLP payload | sample당 91바이트 | OTel collector → 로컬 HTTP 수신기, 비압축 protobuf. scrape당 99.8KB ÷ series 1,098개 |
| remote write payload | sample당 약 8바이트 | 같은 payload를 압축한 크기(scrape당 약 7.9KB) |
| EMF 로그 | 조합·scrape당 3,200바이트 | awsemf `output_destination: stdout`. replica 1개, 조합 12개에서 scrape당 38.3KB |

slim 설정은 LiteLLM `litellm_settings`에서 아래를 뺀 상태다. 자세한 내용은 [8-other-options.md](8-other-options.md)의 cardinality 절에 있다.

- label: `client_ip`, `user_agent`
- metric: `litellm_request_queue_time_seconds`, `litellm_deployment_latency_per_output_token`, `litellm_overhead_latency_metric`, `litellm_llm_api_time_to_first_token_metric`

## 결과

공통 비용은 방안과 무관하게 월 48.4 USD다.

| 공통 항목 | 월 USD |
|---|---:|
| LiteLLM 로그 수집(0.76 USD/GB) | 27.4 |
| LiteLLM 로그 보관(90일, 압축률 0.2 가정) | 0.7 |
| 로그 조회(Logs Insights 월 500GB 스캔 가정) | 3.8 |
| 계정별 수집기 task 2개(0.25vCPU/0.5GB ARM) | 16.6 |

방안별 월 USD. 괄호는 공통 비용을 뺀 방안 추가 비용이다.

| 방안 | 기준 | 대규모 | 기준 slim |
|---|---:|---:|---:|
| 1. 계정별 CloudWatch | 131.6 (83.2) | 453.5 (405.1) | 131.6 (83.2) |
| 2. OAM 중앙 CloudWatch | 131.6 (83.2) | 453.5 (405.1) | 131.6 (83.2) |
| 3. VictoriaMetrics + Grafana | 173.7 (125.3) | 186.3 (137.9) | 173.1 (124.7) |
| 4. AMP + AMG | 248.6 (200.2) | 840.9 (792.5) | 192.5 (144.1) |
| A. CloudWatch OTLP + PromQL | 112.4 (64.0) | 648.7 (600.3) | 86.0 (37.5) |
| B. AMP + ECS Grafana | 216.6 (168.2) | 690.8 (642.4) | 160.5 (112.0) |

- 방안 1·2는 counter 5개만 올리므로 slim 설정과 무관하다. 대신 key·replica 단위와 histogram이 없다
- 방안 1·2의 대규모 비용은 대부분 EMF 로그 수집이다. EMF 이벤트가 replica × 조합마다 생긴다
- 방안 3은 VictoriaMetrics가 sample당 약 1바이트라 EFS 비용만 조금 는다
- 방안 4·B의 차이는 AMG license(기준 68 USD, 대규모 186 USD)와 Grafana task + ALB(35.9 USD)의 차이다

## 비용을 움직이는 손잡이

| 손잡이 | 영향 받는 방안 | 효과 |
|---|---|---|
| scrape 간격 30초 → 60초 | 1·2(EMF), 4, A, B | sample 수와 EMF 이벤트가 절반 |
| slim 설정 | 3, 4, A, B | series 약 40% 감소 |
| EMF dimension에 key·replica 추가 | 1, 2 | 조합마다 custom metric이 생겨 계정당 수백~수천 개 |
| 이미 있는 TGW·peering 사용 | 3 | NLB·PrivateLink 54.4 USD 제거 |
| AMG 대신 ECS Grafana | 4 → B | viewer 10명 기준 32 USD 절감, 30명이면 150 USD 절감 |

## 확인하지 못한 것

- CloudWatch OTLP 과금 GB 기준. 비압축 크기로 계산했다. 압축 크기 기준이면 방안 A가 더 낮아진다
- AMP 저장 크기. sample당 2바이트로 가정했다. 기준 시나리오는 무료 10GB 안이라 결과에 영향이 없다
- 계산에 넣지 않은 것: 대시보드 조회 API(GetMetricData, 수 USD 수준), 데이터 전송, 사람의 운영 시간

## 단가 출처

2026-09 AWS Price List API(`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<서비스>/current/ap-northeast-2/index.json`)의 서울 리전 값이다.

| 항목 | 단가 |
|---|---|
| CloudWatch custom metric | 첫 10,000개 0.30 USD/개·월, 무료 10개 |
| CloudWatch Logs 수집 / 보관 / Insights | 0.76 USD/GB, 0.0314 USD/GB·월, 0.0076 USD/GB 스캔 |
| CloudWatch OTLP metric 수집 | 0.50 USD/GB(15개월 보관 포함) |
| AMP 수집 / 보관 | 첫 2B sample 1,000만 개당 0.90 USD(4,000만 개 무료), 0.03 USD/GB·월(10GB 무료) |
| AMG | editor 9 USD, viewer 5 USD/사용자·월 |
| Fargate ARM | 0.03725 USD/vCPU·시간, 0.00409 USD/GB·시간 |
| ALB·NLB | 0.0225 USD/시간 + LCU |
| PrivateLink interface endpoint | 0.013 USD/AZ·시간, 0.01 USD/GB |
| EFS Standard | 0.33 USD/GB·월 |
