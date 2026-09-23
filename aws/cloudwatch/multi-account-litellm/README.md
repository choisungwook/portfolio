# LiteLLM 멀티 계정 모니터링 방안 비교

dev·prod 계정의 ECS에서 도는 LiteLLM metric과 로그를 모니터링 계정 화면 하나에서 보는 방법 6가지를 실습하고 비용과 장단점을 비교한다. 가격은 2026년 9월 ap-northeast-2 기준이다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-problem.md](docs/1-problem.md) | 상황, 요구사항, 방안 요약과 결론 |
| [2-setup-aws.md](docs/2-setup-aws.md) | AWS 계정 3개 실습 환경 up·down |
| [3-setup-local.md](docs/3-setup-local.md) | 로컬 docker compose 실습 환경 up·down |
| [4-option1-per-account.md](docs/4-option1-per-account.md) | 방안 1. 계정마다 CloudWatch 대시보드 |
| [5-option2-oam.md](docs/5-option2-oam.md) | 방안 2. OAM으로 모니터링 계정에서 함께 보기 |
| [6-option3-selfhosted.md](docs/6-option3-selfhosted.md) | 방안 3. 모니터링 계정 ECS에 VictoriaMetrics + Grafana |
| [7-option4-amp-amg.md](docs/7-option4-amp-amg.md) | 방안 4. AMP + AMG, 방안 3과의 차이 |
| [8-other-options.md](docs/8-other-options.md) | 추가 방안(CloudWatch PromQL, AMP + ECS Grafana, Centralization, 비용 원장, SaaS)과 cardinality |
| [9-cost.md](docs/9-cost.md) | 측정값과 단가로 계산한 방안별 월 비용 |
| [10-decision.md](docs/10-decision.md) | 요구사항 대조, 고르는 순서, 고른 조합 |

## 실습 코드

- [compose.yaml](compose.yaml), [local/](local/) — 로컬 lab. LiteLLM(mock 모델), vmagent, VictoriaMetrics, Grafana 대시보드 2개, 부하 생성기
- [terraform/](terraform/) — AWS 계정 3개. 방안별 스위치(`enable_oam`, `enable_selfhosted`, `enable_amp`, `enable_amg`)
- [scripts/cost.py](scripts/cost.py) — 방안별 월 비용 계산기
