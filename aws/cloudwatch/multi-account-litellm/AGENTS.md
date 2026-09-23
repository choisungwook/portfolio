# LiteLLM 멀티 계정 모니터링 핸즈온

ECS에서 도는 LiteLLM의 metric·로그를 dev·prod 계정에서 모니터링 계정으로 모아 보는 방안 6가지를 실습하고 비교하는 workspace다.

글로벌 규칙은 @../../../AGENTS.md를 따른다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.

## 검증 상태

- 로컬 lab 설정(LiteLLM config, vmagent scrape 설정, 부하 생성기, Grafana 대시보드 쿼리 15개)은 LiteLLM 1.102.1(PyPI)과 VictoriaMetrics 1.152.0 바이너리를 네이티브로 띄워 확인했다. 작성 환경에서 docker image pull이 차단되어 `docker compose up` 자체는 실행하지 못했다
- 수집기 설정 템플릿은 otelcol-contrib 0.158.0 `validate`로 4개 조합을 확인했다. awsemf 출력과 remote write 이름은 로컬에서 측정했다
- terraform은 `validate`, `fmt`, `terraform test`(mock provider plan 2개)만 통과했다. AWS에 apply하지 않았다
- 방안 A(CloudWatch OTLP)는 terraform에 넣지 않았다. IAM action과 과금 기준을 확인하지 못했다

## 수정할 때

- 대시보드 JSON은 로컬 lab과 AWS(방안 3·4·B)가 같은 파일을 쓴다. datasource는 변수(`${datasource}`)로 두고 uid를 고정하지 않는다
- 측정값이 바뀌면 `scripts/cost.py`의 `Measured`와 `docs/9-cost.md` 표, 각 방안 문서의 비용 절을 같이 고친다
