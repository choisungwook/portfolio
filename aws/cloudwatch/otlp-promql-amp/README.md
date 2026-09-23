# CloudWatch OTLP + PromQL과 AMP 비교

ECS의 수집기 하나가 같은 Prometheus metric을 CloudWatch(OTLP)와 AMP(remote write)에 동시에 보내고, 같은 PromQL로 두 저장소를 비교합니다. 조회는 CLI, CloudWatch 대시보드, Grafana에서 합니다. Grafana는 ECS 직접 운영(기본)과 AMG 중 terraform 변수로 고릅니다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-problem.md](docs/1-problem.md) | 두 저장소의 차이와 실습 구조 |
| [2-setup.md](docs/2-setup.md) | 준비, up, down, 로컬 확인, 비용 |
| [3-collector.md](docs/3-collector.md) | 수집기 한 개로 두 저장소에 보내는 설정과 함정 |
| [4-query.md](docs/4-query.md) | CLI, CloudWatch 대시보드, ECS Grafana, AMG 조회 |
| [5-compare.md](docs/5-compare.md) | label, histogram, p95 비교와 고르는 기준 |
| [6-grafana-choice.md](docs/6-grafana-choice.md) | Grafana 직접 운영(기본)과 AMG 비교, `grafana` 변수 |

## 실습 코드

- [app/app.py](app/app.py) — LLM gateway를 흉내 내는 demo app
- [collector/config.yaml](collector/config.yaml) — ECS와 로컬이 같이 쓰는 수집기 설정
- [terraform/](terraform/) — ECS, AMP, CloudWatch 대시보드, ECS Grafana, AMG, IAM role
- [grafana/](grafana/) — datasource와 비교 대시보드
- [scripts/promql.sh](scripts/promql.sh), [scripts/amg-setup.sh](scripts/amg-setup.sh) — CLI 조회, AMG datasource 등록
- [compose.yaml](compose.yaml) — AWS 없이 app과 수집기 설정만 확인
- [docs/imgs/src/](docs/imgs/src/) — 문서 그림 원본 SVG와 PNG 변환 스크립트
