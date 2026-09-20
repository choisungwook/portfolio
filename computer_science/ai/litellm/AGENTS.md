# LiteLLM 학습 핸즈온 — agent 맥락

이 파일은 이 workspace(`computer_science/ai/litellm`)에서 작업하는 agent를 위한 맥락이다. 저장소 전체 규칙은 루트 [AGENTS.md](../../../AGENTS.md)를 따른다. 같은 목적의 Go 기반 gateway Bifrost는 형제 워크스페이스 [../bifrost/](../bifrost/)에 있고, 이 워크스페이스의 폐쇄망 Terraform을 재사용한다.

## 목적

LiteLLM을 전혀 모르는 사람을 위한 3시간 학습 가이드와 실습 환경을 만든다. 실습 환경은 `scenarios/` 아래에 시나리오마다 하나씩 두고, 각 시나리오는 자기 compose·config·`.env`를 갖는 독립 환경이다. 학습 축은 "엔터프라이즈가 AI gateway에 요구하는 기능" 6가지다: model 다중 선택(라우팅·fallback), 인증/인가(virtual key·team), token rate limit, audit/비용 추적, guardrail, 인터넷이 안 되는 곳(폐쇄망) 구축.

## 현재 상태

구현 완료. 검증 수준은 아래와 같다.

- LiteLLM: `docker compose up`으로 기동 확인. config.yaml의 gpt·gemini 별칭 로드, Postgres 마이그레이션, virtual key 발급(모델 제한·rpm), guardrail 설정 로드 확인. 실제 provider 호출·fallback은 provider key가 있어야 해 미검증.
- team/user 권한, web UI, client 연동(python·Codex) 문서는 LiteLLM·Codex 공식 문서 기준으로 작성했다. provider key와 라이브 gateway가 없어 실제 호출·콘솔 조작은 미검증이며, curl·config·CLI 명령 형태만 문서화했다.
- bedrock-cost: 2026-09-20 시나리오 1~4를 Bedrock 실호출로 돌려 CloudWatch 지표와 대조했다. 결과는 `scenarios/bedrock-cost/docs/3-scenarios.md` 기록표에 있다. 금액이 어긋난 것은 시나리오 4(스트림 중단)뿐이다. Cost Explorer 금액 대조는 데이터가 하루 뒤에 나와 미검증이다.
- 폐쇄망 Terraform: `terraform validate` 통과. `apply`는 비용이 들어 사용자 지시가 있을 때만. Bifrost 워크스페이스도 이 인프라를 공용으로 쓴다.

최초 구현 plan은 [for_agents/plan.md](for_agents/plan.md)에 남아 있다(계획의 기록).

## 구조

- `for_agents/plan.md` — 최초 구현 plan (기록)
- `adr/` — 이 workspace의 의사결정 기록 (OKF Decision 형식)
- `docs/1~10` — 커리큘럼. akbun 설득식. Track A는 라우팅·인증·team/user·감사·guardrail·web UI·client 연동(1~8), Track B는 폐쇄망 Bedrock(9~10). 실습 환경은 `2-setup.md`(로컬)·`9-setup.md`(폐쇄망)로 분리하고 내용 문서는 링크만 건다
- `docs/manual/` — manual 트랙(웹 UI 구성) 가이드. web-ui-setup.md 한 편(+README). set-model이 config.yaml 선언 방식이라면 manual은 /ui에서 모델·key·team을 손수 등록하는 방식. 예전 config/API 레퍼런스(model-registration·config-yaml·key-management)는 삭제하고 narrative의 관련 링크도 제거했다. compose 레퍼런스 docker-compose.md는 `scenarios/manual/`에 있다
- `scenarios/` — 실습 환경. 시나리오마다 디렉터리 하나이고 각자 compose·config·`.env`를 갖는다. compose 맨 위 `name:`으로 project 이름을, host port로 접근 지점을 갈라 동시에 띄워도 간섭하지 않는다. 목록과 port 표는 `scenarios/README.md`에 있고, 시나리오를 추가하면 그 표에 한 줄 더한다
- `scenarios/set-model/` — narrative Track A가 가리키는 LiteLLM 실습: proxy + Postgres, gpt·gemini 등록 + spend 로깅까지 켜진 완성 config. host port 4000. README는 엔지니어면 다 아는 설정 설명을 빼고 간결하게 유지한다
- `scenarios/manual/` — 깡통 gateway. model_list는 비우고 general_settings에 `store_model_in_db: true`만 둬서, 학습자가 웹 UI(/ui)에서 모델·key·team을 손수 등록한다. host port 4010. 절차는 `docs/manual/web-ui-setup.md`, compose 레퍼런스는 같은 디렉터리의 docker-compose.md
- `scenarios/bedrock-cost/` — LiteLLM spend와 AWS 청구의 차이를 측정하는 실습. proxy v1.99.1 + Postgres + Redis, Bedrock global inference profile. host port는 proxy 4020, Prometheus 9090, Grafana 3000. 자기 `docs/`, `scripts/`, `observability/`를 갖는 자기완결 시나리오다. LiteLLM은 `callbacks: ["prometheus"]`로 자기 `/metrics`를 열고, Bedrock 쪽은 cloudwatch-exporter가 CloudWatch 지표를 옮긴다. Grafana에는 LiteLLM 공식 대시보드 사본과 이 실습이 만든 대시보드 3종이 프로비저닝된다
- `clients/` — Track A client 연동 예제(python-client.py, codex-config.toml). 기존 설정을 건드리지 않게 격리해 gateway에 붙인다
- `terraform/` — 폐쇄망 인프라(Bifrost 워크스페이스와 공용): 완전 폐쇄 private subnet + VPC endpoint 7종 + EC2(AL2023 arm64 t4g.medium) + ECR + Bedrock IAM

## ADR (결정 - 이유)

세부는 adr/의 각 파일에 있다.

- 결정: 실습을 로컬 docker compose와 폐쇄망 Terraform 두 트랙으로 나눈다. gateway 기능 실습은 로컬에서, 폐쇄망 조건 재현은 AWS에서 한다. / 이유: 기능 실습에 인프라 비용이 필요 없고, 두 트랙의 대비가 gateway의 핵심 가치를 보여준다. → [adr/2026-07-two-track-litellm-lab.md](adr/2026-07-two-track-litellm-lab.md)
- 결정: 폐쇄망 트랙의 LLM은 GPT·Gemini 대신 Bedrock을 쓴다. / 이유: SaaS API는 인터넷이 필요하고, VPC endpoint로 내부 도달 가능한 LLM은 Bedrock이 사실상 유일하다. → [adr/2026-07-two-track-litellm-lab.md](adr/2026-07-two-track-litellm-lab.md)
- 결정: private subnet은 NAT도 없는 완전 폐쇄로 만들고 ssm·ssmmessages·ec2messages·s3·ecr.api·ecr.dkr·bedrock-runtime endpoint만 둔다. EC2는 AL2023 arm64 표준 AMI(t4g.medium). / 이유: 엔터프라이즈 폐쇄망 조건을 깨지 않기 위해서고, AL2023은 dnf 저장소가 S3 기반이라 S3 gateway endpoint만으로 패키지 설치가 되어 전용 AMI 없이 실습이 성립한다. → [adr/2026-07-closed-private-subnet-design.md](adr/2026-07-closed-private-subnet-design.md)

- 결정: Track A 핸즈온을 curl 검증에서 team/user·web UI·client(python·Codex) 연동까지 확장하고, 신규 3편을 Track A에 삽입하며 Track B를 재번호한다(5·6·7-setup/airgapped → 6·9·10). / 이유: A4 1장 제한으로 검증이 curl-ping에 머물러 gateway 통제가 실제 client·팀 운영으로 이어지지 못했다. client는 기존 설정을 건드리지 않게 격리한다. → [adr/2026-07-expand-track-a-handson.md](adr/2026-07-expand-track-a-handson.md)

- 결정: 실습 환경을 `install/` 두 종에서 `scenarios/` 아래 시나리오별 디렉터리로 바꾸고, compose `name:`과 host port를 시나리오마다 다르게 둔다. / 이유: 시나리오가 셋으로 늘면서 host port 4000과 디렉터리 이름에서 파생되는 project 이름이 겹쳐 서로의 볼륨과 포트를 건드렸다. → [adr/2026-09-scenario-per-directory.md](adr/2026-09-scenario-per-directory.md)
- 결정: bedrock-cost 시나리오는 가격표를 이미지 내장본으로 고정하고 재시도를 끄며 `global.` inference profile을 쓴다. / 이유: 단가와 호출 수가 실행 시점에 따라 흔들리면 두 장부를 비교할 수 없다. → [adr/2026-09-bedrock-cost-lab-fixtures.md](adr/2026-09-bedrock-cost-lab-fixtures.md)

- 결정: bedrock-cost의 두 장부를 Prometheus 한 곳에서 질의한다. LiteLLM은 자기 `/metrics`, Bedrock은 cloudwatch-exporter다. Grafana는 두지 않는다. / 이유: 두 장부가 한곳에 있어야 캐시 token을 빼는 질의로 131배 차이를 닫을 수 있고, 확인할 질의가 여섯 개뿐이라 대시보드는 값을 하지 못한다. → [adr/2026-09-observe-two-ledgers-in-prometheus.md](adr/2026-09-observe-two-ledgers-in-prometheus.md)

- Bifrost 추가와 인프라 재사용 결정은 형제 워크스페이스의 [../bifrost/adr/2026-07-add-bifrost-track.md](../bifrost/adr/2026-07-add-bifrost-track.md)에 있다.

## agent가 알아야 할 제약

- 폐쇄망 트랙에 인터넷 경로(IGW 라우트, NAT, public IP)를 추가하지 않는다. 이 조건이 핸즈온의 존재 이유다.
- LiteLLM은 일부 기능이 enterprise tier다. 문서를 쓸 때 OSS/enterprise 경계를 docs.litellm.ai에서 확인해 명시한다.
- API key(.env, terraform.tfvars)는 커밋하지 않는다. 예시 파일(.env.example, terraform.tfvars.example)만 둔다.
- Terraform은 [.claude/rule-details/terraform.md](../../../.claude/rule-details/terraform.md)를 따르되, 새 VPC 생성은 사용자가 명시 요청한 예외다.
- commit·push·PR·Issue는 사용자가 명시적으로 지시할 때만 한다.
- `scenarios/bedrock-cost/docs/`의 HTML 세 편(v3, visual, visual-v2)은 실측값을 파일 안에 상수로 들고 있다. 기록표를 고치면 세 파일도 같이 고친다. v3.html은 diagram-design 플러그인의 기본 스킨과 §6 커넥터 규칙을 따른다.

## 미완 작업

- `todo-generate-image` 마커가 붙은 네트워크 흐름 이미지 프롬프트가 `docs/9-setup.md`에 있다(폐쇄망 토폴로지). 이미지 모델(GPT image, nano-banana 등)로 그림을 만들어 `imgs/`에 넣고, 마커와 프롬프트 블록을 이미지 링크로 교체해야 한다. 프롬프트는 akbun-draw-network-relationship 스타일이다. `docs/1-why-ai-gateway.md`의 그림은 이미 `imgs/flow.png`로 교체됐다. (Bifrost 쪽 프롬프트는 [../bifrost/](../bifrost/) 워크스페이스에 있다.)

## 수정 시 주의

- 구현이 plan과 달라지면 plan.md를 고치지 말고 이 파일의 구조·제약 절과 adr/를 갱신한다. plan.md는 당시 계획의 기록으로 남긴다.
- 새 의사결정은 adr/에 OKF Decision 형식으로 추가하고 이 파일의 ADR 절에 한 줄 요약을 더한다.
- PR 직전에 knowledge/ 승격 후보를 검토한다. 후보 목록은 plan.md 마지막 절에 있다.
