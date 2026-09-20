# bedrock-cost: LiteLLM spend와 Bedrock 청구의 차이 측정

LiteLLM이 기록한 spend와 AWS가 청구한 금액은 같은 호출을 다르게 센다. 응답 캐시, Bedrock prompt caching, 끊긴 스트림이 어디서 얼마나 차이를 만드는지 $5 미만으로 측정한다. 모델은 `global.anthropic.claude-sonnet-4-6`이고 proxy는 v1.99.1이다.

## 띄우기

예시를 복사해 `.env`에 Bedrock 호출용 IAM 키를 채운 뒤 올린다. 권한과 절차는 [docs/2-setup.md](docs/2-setup.md)에 있다.

```bash
cp .env.example .env
docker compose up -d
```

host port는 proxy 4020, Prometheus 9090, Grafana 3000이다. 다른 시나리오를 띄운 채로 올려도 겹치지 않는다.

```bash
curl -s http://localhost:4020/health/liveliness
```

## 문서

| 문서 | 내용 |
|---|---|
| [docs/1-problem.md](docs/1-problem.md) | 두 숫자가 다른 이유, 시나리오 4개, 예산 |
| [docs/2-setup.md](docs/2-setup.md) | IAM 권한, 환경 up과 down, 기본값을 바꾼 이유 |
| [docs/3-scenarios.md](docs/3-scenarios.md) | 시나리오 실행, 실측 기록표, input token 분해 |
| [docs/4-why-different.md](docs/4-why-different.md) | LiteLLM 소스와 이력으로 본 차이의 원인 |
| [docs/5-litellm-dashboard.md](docs/5-litellm-dashboard.md) | LiteLLM 관리 콘솔과 공식 Grafana 대시보드에서 token 파고들기 |
| [docs/6-observe.md](docs/6-observe.md) | Prometheus·Grafana로 두 장부를 나란히 확인, AWS 권장 관찰 수단 |
| [docs/v3.html](docs/v3.html) | 구조와 두 장부 비교 다이어그램 |
| [docs/visual.html](docs/visual.html) | 실측값 표와 막대로 보는 차이 |
| [docs/visual-v2.html](docs/visual-v2.html) | 슬라이드형 애니메이션. Space로 단계, ←→로 슬라이드 |

## 스크립트

| 스크립트 | 하는 일 |
|---|---|
| `scripts/scenario.sh <1~4>` | 시나리오별 요청을 보낸다. tags로 spend log에서 구분한다 |
| `scripts/report-litellm.sh` | Postgres의 spend log를 시나리오별로 집계한다 |
| `scripts/report-aws.sh` | CloudWatch의 Bedrock 지표를 읽고 Cost Explorer 명령을 출력한다 |
| `scripts/report-input-gap.sh` | LiteLLM prompt_tokens를 Cost Explorer의 input token 기준으로 쪼갠다 |
| `scripts/run-all.sh` | 캐시를 비우고 counter를 되돌린 뒤 시나리오 1~4를 간격을 두고 돌린다 |
| `scripts/cloudwatch-dashboard.sh` | Bedrock token 지표 네 종류를 모은 CloudWatch 대시보드를 만든다 |

## 관찰 구성

| 파일 | 하는 일 |
|---|---|
| `observability/prometheus.yml` | LiteLLM `/metrics`는 15초, CloudWatch는 5분 주기로 수집한다 |
| `observability/cloudwatch.yml` | AWS/Bedrock 지표 5종을 Prometheus metric으로 바꾼다 |
| `observability/grafana/dashboards/` | 대시보드 4종. 두 장부 비교, 요청과 호출, 캐시가 막는 호출, LiteLLM 공식 |
| `observability/grafana/provisioning/` | datasource와 대시보드 자동 등록 |

AWS 자격증명은 `.env`에서 compose가 cloudwatch-exporter 컨테이너에만 넘긴다. Grafana는 AWS를 직접 부르지 않는다. `.env`는 `.gitignore`에 걸려 있고, 커밋 대상 파일에는 변수 이름만 있다.
