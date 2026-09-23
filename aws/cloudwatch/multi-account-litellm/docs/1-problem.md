# LiteLLM 멀티 계정 모니터링: 문제와 결론

ECS에 배포한 LiteLLM의 metric과 로그를 dev·prod 계정이 각자 CloudWatch에 쌓고 있다. 이 데이터를 모니터링 계정 화면 하나에서 함께 보는 방법 6가지를 비교한다. 가격은 2026년 9월 ap-northeast-2 기준이다.

## 상황

- AWS 계정 3개: 모니터링, dev, prod
- LiteLLM은 ECS(Fargate)에서 돈다. prod는 replica가 여러 개다
- LiteLLM 로그와 metric은 각 계정 CloudWatch에 있다
- LiteLLM 비용 대시보드와 exporter를 추가할 예정이다

## 요구사항

| 요구 | 기준 |
|---|---|
| 한 화면 | 계정을 바꿔 로그인하지 않고 dev·prod를 나란히 본다 |
| replica 단위 | prod replica 중 하나만 느리거나 내려간 상황을 찾는다 |
| 90일 보관 | metric 추이를 90일 동안 본다 |
| 비용 | team·model·key별 LiteLLM spend를 본다 |
| 처음 보는 사람 | 맥락을 모르는 사람도 링크 하나로 열고 해석한다 |
| 운영 부담 | 전담 운영자 없이 유지한다 |

## LiteLLM이 내는 데이터

로컬 lab에서 LiteLLM v1.102.1을 띄워 확인한 내용이다. 방법은 [3-setup-local.md](3-setup-local.md)에 있다.

- 로그(`JSON_LOGS=True`)에는 access log와 에러만 있다. team·model·token·spend는 로그에 남지 않는다
- team·model·key별 요청과 spend는 `/metrics`(Prometheus 형식)에만 있다. v1.80부터 OSS에 포함된다
- replica마다 counter를 따로 센다. 계정 합계는 replica를 하나씩 긁은 뒤 `sum()`으로 더한다
- replica 하나의 series 수는 약 `28 + 89 × (요청이 성공한 key×model 조합 수)`다. latency histogram bucket이 대부분이다

그래서 방안의 차이는 "LiteLLM metric을 어디에 저장하고 어떤 화면으로 보나"에서 생긴다. 로그는 어느 중앙 방안이든 각 계정 CloudWatch Logs에 그대로 두고 OAM으로 읽는다.

## 방안 요약

월 비용은 [scripts/cost.py](../scripts/cost.py) 기준 시나리오(prod replica 3개, 조합 60개, viewer 10명) 값이고 공통 비용 48 USD를 포함한다. 계산 근거는 [9-cost.md](9-cost.md)에 있다.

| 방안 | LiteLLM metric 저장 | 화면 | 계정을 넘는 방법 | 월 USD | 문서 |
|---|---|---|---|---:|---|
| 1 | 각 계정 CloudWatch custom metric | 계정별 CloudWatch 대시보드 | 계정을 바꿔 로그인 | 132 | [4-option1-per-account.md](4-option1-per-account.md) |
| 2 | 각 계정 CloudWatch custom metric | 모니터링 계정 CloudWatch 대시보드 | OAM | 132 | [5-option2-oam.md](5-option2-oam.md) |
| 3 | 모니터링 계정 VictoriaMetrics | Grafana(ECS) | PrivateLink + remote write | 174 | [6-option3-selfhosted.md](6-option3-selfhosted.md) |
| 4 | Amazon Managed Service for Prometheus | Amazon Managed Grafana | IAM role + remote write | 249 | [7-option4-amp-amg.md](7-option4-amp-amg.md) |
| A | CloudWatch OTel metric | CloudWatch PromQL | OAM(계정별 쿼리) | 112 | [8-other-options.md](8-other-options.md) |
| B | Amazon Managed Service for Prometheus | Grafana(ECS) | IAM role + remote write | 217 | [8-other-options.md](8-other-options.md) |

## 결론

- 방안 2(OAM)를 먼저 켠다. 로그와 ECS·ALB metric은 이것만으로 모니터링 계정 대시보드 하나에 올라온다. 3·4·A·B도 로그는 OAM으로 읽으므로 버리는 작업이 없다
- LiteLLM metric과 비용 대시보드는 방안 4(AMP + AMG)를 추천한다. 서버 없이 90일 보관과 Grafana 화면을 얻고, 계정 사이에 네트워크를 뚫지 않는다
- IAM Identity Center를 쓰지 않거나 가끔 보는 사람이 많으면 AMG 대신 Grafana를 ECS에 띄운다(방안 B)
- 비용과 구성 요소를 가장 줄이려면 방안 A(CloudWatch PromQL)를 PoC로 확인한다. 2026년 6월 GA라 과금 기준과 교차 계정 질의 제약을 먼저 본다
- 방안 3은 series가 10만 개를 넘어 AMP 비용이 커지고 운영 전담자가 있을 때 고른다
- 방안 1은 모니터링 계정을 준비하기 전의 임시 단계다

판단 과정은 [10-decision.md](10-decision.md)에 있다.
