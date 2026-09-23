# CloudWatch OTLP와 AMP에 같은 metric을 넣고 PromQL로 비교하기

Prometheus 형식 metric을 AWS에 저장하는 길은 두 가지입니다. CloudWatch에 OTLP로 보내고 PromQL로 읽는 길, 그리고 AMP에 remote write로 보내는 길입니다. 이 실습은 한 수집기가 같은 데이터를 두 저장소에 동시에 넣고, 같은 질문을 두 저장소에 던져 무엇이 같고 무엇이 다른지 확인합니다.

## 두 저장소 모두 PromQL을 받지만 데이터 모양이 다릅니다

둘 다 Prometheus 호환 조회 API(`/api/v1/query`)를 열고, Grafana에서는 같은 plugin으로 붙습니다. 차이는 저장하는 방식에서 나옵니다.

| 기준 | CloudWatch OTLP + PromQL | AMP |
|---|---|---|
| 넣는 방법 | OTLP HTTP(`/v1/metrics`) | Prometheus remote write |
| SigV4 서비스 이름 | `monitoring` | `aps` |
| 저장 모델 | OTel 원형(counter, native histogram)과 resource 속성 | Prometheus series(`_bucket`, `_count`, `_sum`) |
| 과금 | 수집 GB당, 15개월 보관 포함 | 수집 sample 수와 보관 GB |
| 저장소 준비 | 없음. 리전 endpoint가 이미 있음 | workspace 생성 |

그래서 같은 PromQL이 두 저장소에서 그대로 도는 경우와, 쿼리를 바꿔야 하는 경우가 갈립니다. 어느 쪽인지는 [5-compare.md](5-compare.md)에 측정값으로 정리했습니다.

## 실습 구조: 쓰는 쪽과 읽는 쪽이 각자 IAM role을 가집니다

![실습 구조](imgs/architecture.png)

- ECS Fargate에 demo app 2개와 수집기 1개를 띄웁니다. 수집기는 Cloud Map 이름 `app.otlp-promql-amp.internal`의 A 레코드로 app replica를 하나씩 찾아 긁습니다.
- 수집기는 task role 하나로 두 저장소에 씁니다. 권한은 `cloudwatch:PutMetricData`와 AMP workspace에 대한 `aps:RemoteWrite`뿐입니다.
- 조회는 CloudWatch 대시보드와 Grafana에서 합니다. Grafana는 terraform 변수 `grafana`로 ECS 직접 운영(기본)과 AMG 중 하나를 고릅니다. 조회 role에는 쓰기 권한이 없습니다.
- 로컬 AWS profile은 `terraform apply`와 사람이 CLI로 조회할 때만 씁니다. 컨테이너에는 자격 증명을 넣지 않습니다.

demo app은 LLM gateway를 흉내 냅니다. 외부 호출 없이 app 하나가 초당 5건씩 요청을 만들고, 아래 metric을 노출합니다.

| metric | 종류 | label |
|---|---|---|
| `demo_requests_total` | counter | `model`, `team`, `status` |
| `demo_tokens_total` | counter | `model`, `team` |
| `demo_request_duration_seconds` | histogram(bucket 6개) | `model` |

응답 시간은 model마다 평균이 다른 지수분포(0.4초, 1.2초, 2.5초)입니다. 그래서 실제 p95를 계산할 수 있고, 두 저장소의 p95 추정값을 정답과 비교할 수 있습니다.

## 문서 순서

| 문서 | 내용 |
|---|---|
| [2-setup.md](2-setup.md) | 준비, up, down, 켜 둔 동안의 비용 |
| [3-collector.md](3-collector.md) | 수집기 한 개로 두 저장소에 보내는 설정과 함정 |
| [4-query.md](4-query.md) | CLI, CloudWatch 대시보드, ECS Grafana, AMG로 조회 |
| [5-compare.md](5-compare.md) | label, histogram, p95, 제약 비교와 고르는 기준 |
| [6-grafana-choice.md](6-grafana-choice.md) | Grafana 직접 운영과 AMG 비교 |
