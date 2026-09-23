# 추가 방안과 공통 고려사항

방안 1~4 외에 검토할 만한 선택지 5개와, 어느 방안을 고르든 걸리는 cardinality 문제를 정리한다.

## A. CloudWatch OTel metric + PromQL

LiteLLM metric을 EMF 대신 OTLP로 CloudWatch에 보내고 PromQL로 조회한다. 2026년 6월 16일 GA, 서울 리전 지원이다.

- 수집 endpoint는 `https://monitoring.<region>.amazonaws.com/v1/metrics`이고 SigV4로 서명한다
- label을 datapoint당 최대 150개까지 받는다. custom metric처럼 dimension 조합마다 과금하지 않고 수집 GB로 과금한다
- 수집 0.50 USD/GB에 15개월 보관이 포함된다. PromQL API 조회는 sample 100만 개당 0.01 USD, 콘솔 조회는 무료다
- 대시보드는 `chart` 위젯에 `language: PromQL` 쿼리를 넣는다. Query Studio에서도 PromQL을 실행한다

수집 경로는 두 가지다.

| 경로 | 방법 | 비용 |
|---|---|---|
| 기존 수집기 | 수집기 설정에 OTLP exporter를 추가하고 `sigv4auth`로 서명 | 수집기는 공통 비용에 이미 있음 |
| CloudWatch managed collector(2026년 7월) | ECS를 Cloud Map DNS로 찾아 AWS가 scrape | collector당 0.04 USD/시간(월 29.2 USD) |

계정을 넘는 방법과 제약:

- OAM 모니터링 계정에서 쿼리마다 `accountId`를 지정해 source 계정을 조회한다. 쿼리 하나는 계정 하나만 본다
- 한 PromQL 식으로 dev+prod를 합치려면 Metrics Centralization(AWS Organizations 필요)으로 모니터링 계정에 복사한다
- EMF로 보낸 metric은 PromQL로 조회하지 못한다. OTLP로 보낸 metric만 된다

비용은 기준 시나리오 월 64.0 USD(공통 포함 112.4)로 6개 방안 중 가장 낮다. 대규모 시나리오는 600.3 USD다.

확인이 필요한 것:

- 과금 GB 기준. 로컬 측정한 OTLP protobuf 비압축 크기(sample당 91바이트)로 추정했다. 압축 후 크기로 과금하면 10분의 1 가까이 줄어든다
- OAM link의 resource type이 OTel metric을 포함하는지
- 수집 권한(IAM action)과 endpoint 경로는 AWS 문서 "OpenTelemetry metrics" 절차를 따른다

PoC 순서:

1. 방안 2 환경에서 수집기에 OTLP exporter를 추가한다
2. 모니터링 계정 Query Studio에서 `sum by (team_alias) (increase(litellm_spend_metric_total[1h]))`를 prod 계정으로 실행한다
3. 하루 뒤 Cost Explorer에서 OTLP 수집 usage type의 GB를 [9-cost.md](9-cost.md) 추정과 비교한다

## B. AMP + ECS Grafana

방안 4에서 AMG만 방안 3의 Grafana로 바꾼다. 저장소 운영은 없고 Grafana 운영만 남는다.

- viewer license가 없다. 가끔 보는 사람이 많을수록 방안 4보다 유리하다
- editor 2명, viewer 30명이면 AMG license는 168 USD, Grafana task + ALB는 35.9 USD다
- Grafana 패치와 인증(SSO)은 직접 한다

실습은 `enable_selfhosted = true`, `enable_amp = true`를 함께 켠다. Grafana task role에 AMP 조회 권한이 붙고 AMP datasource plugin이 설치된다.

1. Grafana에 admin으로 로그인한다. 비밀번호는 `terraform -chdir=terraform output -raw selfhosted_grafana_admin_password`
2. Connections → Data sources → Amazon Managed Service for Prometheus를 추가한다. URL은 `amp_query_endpoint` output, 인증은 AWS SDK Default, 리전은 ap-northeast-2
3. 운영 개요 대시보드 위 "저장소" 드롭다운에서 VictoriaMetrics(`metrics`)와 AMP를 바꿔 가며 같은 그래프가 그려지는지 본다

실습 환경에는 VictoriaMetrics도 함께 뜬다. 운영에서 B를 고르면 VictoriaMetrics, NLB, PrivateLink는 만들지 않는다.

## C. Logs·Metrics Centralization

OAM은 조회만 한다. Centralization은 모니터링 계정으로 데이터를 복사한다. 둘 다 AWS Organizations가 필요하다.

| 기준 | OAM | Centralization |
|---|---|---|
| 데이터 위치 | source 계정 | 모니터링 계정에 복사본 |
| source 계정이 사라지면 | 조회 불가 | 복사본이 남음 |
| 비용 | 공유 무료 | 로그 첫 복사본 무료, 추가 복사본 0.05 USD/GB, 복사본 보관료 |
| 여러 계정을 한 쿼리로 | 로그는 가능, PromQL은 계정별 | 로그 `@aws.account`, metric PromQL 한 식으로 가능 |
| Organizations | 선택 | 필수 |

- 로그 Centralization은 2025년 9월, Metrics Centralization은 2026년 6월 GA다
- 규칙을 만든 뒤 들어온 데이터만 복사한다
- 감사나 보존 정책 때문에 모니터링 계정에 원본과 별개인 기록이 있어야 할 때 고른다

## D. 비용 대시보드의 원장: metric과 LiteLLM DB

LiteLLM spend는 두 곳에 남는다. 용도가 다르다.

| 원장 | 강점 | 약점 |
|---|---|---|
| `/metrics`의 `litellm_spend_metric_total` | 추이, 급증 감지, 알람 | replica 재시작마다 counter가 0으로 돌아가 짧은 구간 `increase()`에 추정 오차 |
| LiteLLM DB(`LiteLLM_SpendLogs`, 일별 집계 테이블) | 월 합계, team별 청구, 감사 | DB에 접근할 경로가 필요 |

- 추가 예정인 LiteLLM exporter는 DB를 읽어 gauge로 내보낸다. 커뮤니티 구현으로 exporter-litellm이 있다
- exporter를 각 계정에 띄우고 수집기 `scrape_configs`에 job 하나를 더하면 LiteLLM metric과 같은 경로로 중앙 저장소에 간다. histogram이 없어 series가 적다
- LiteLLM spend는 AWS 청구서와 다르다. 응답 캐시, prompt caching, 끊긴 스트림에서 차이가 난다. [LiteLLM spend와 Bedrock 청구가 다른 이유](../../../../computer_science/ai/litellm/scenarios/bedrock-cost/README.md)에서 측정했다

## E. SaaS

Datadog, Grafana Cloud 같은 SaaS는 구축이 가장 짧고 화면이 이미 완성돼 있다.

- metric과 로그가 AWS 밖으로 나가 보안 검토가 필요하다
- 과금 단위가 host, series, 사용자, 로그 GB로 제품마다 다르다
- 이 문서의 비용 계산에는 넣지 않았다

## 모든 방안 공통: label cardinality

series 수가 곧 비용이다(AMP, CloudWatch OTLP, EMF 로그). LiteLLM 기본 설정은 series를 불필요하게 늘리는 label과 metric을 포함한다.

- `litellm_spend_metric_total`에는 `client_ip`, `user_agent` label이 붙는다. client가 늘거나 SDK 버전이 바뀔 때마다 series가 새로 생긴다
- latency histogram 5종이 replica × key × model마다 bucket 15~18개씩 series를 만든다

LiteLLM 설정에서 줄인다.

```yaml
litellm_settings:
  callbacks: ["prometheus"]
  prometheus_exclude_labels: ["client_ip", "user_agent"]
  prometheus_exclude_metrics:
    - litellm_request_queue_time_seconds
    - litellm_deployment_latency_per_output_token
    - litellm_overhead_latency_metric
    - litellm_llm_api_time_to_first_token_metric
```

- 수집기에서 `labeldrop`으로 label만 지우지 않는다. 합치지 않고 지우면 서로 다른 series가 같은 이름이 되어 counter 값이 틀어진다
- 절감 효과는 [9-cost.md](9-cost.md)에 측정값이 있다
