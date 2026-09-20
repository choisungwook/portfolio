# LiteLLM AI gateway 학습 핸즈온

LiteLLM을 전혀 모르는 사람이 "엔터프라이즈가 AI gateway에 요구하는 기능"을 직접 만지는 실습이다. 로컬 docker compose로 라우팅·인증·team 권한·한도·감사·가드레일을 다루고, 관리 콘솔과 실제 client(python·Codex) 연동까지 해본다(Track A). 그다음 NAT도 없는 폐쇄망 Terraform으로 인터넷 없이 Bedrock을 부른다(Track B).

## 문서

| 문서 | 내용 |
|---|---|
| [1-why-ai-gateway.md](docs/1-why-ai-gateway.md) | AI gateway가 AI 도입의 첫 관문인 이유, 요구 기능 6가지 |
| [2-setup.md](docs/2-setup.md) | 로컬 실습 환경 준비(Track A): proxy + Postgres |
| [3-routing.md](docs/3-routing.md) | GPT·Gemini 라우팅과 fallback |
| [4-auth-rate-limit.md](docs/4-auth-rate-limit.md) | virtual key 인증/인가, RPM·예산 한도 |
| [5-team-user.md](docs/5-team-user.md) | team·user 계층 예산 상속과 권한 제어 |
| [6-audit-guardrails.md](docs/6-audit-guardrails.md) | spend log 감사, guardrail |
| [7-web-ui.md](docs/7-web-ui.md) | 관리 콘솔로 key·팀·스펜드·로그 관리 |
| [8-connect-clients.md](docs/8-connect-clients.md) | python·Codex client를 격리 설정으로 연동, 롤백 |
| [9-setup.md](docs/9-setup.md) | 폐쇄망 실습 환경 준비(Track B): VPC endpoint + EC2 |
| [10-airgapped-bedrock.md](docs/10-airgapped-bedrock.md) | 폐쇄망에서 Bedrock 호출 |

## 실습 시나리오

시나리오마다 디렉터리 하나이고, 각자 자기 compose·config·`.env`를 갖는다. 동시에 띄워도 서로 간섭하지 않는다. 목록과 port는 [scenarios/README.md](scenarios/README.md)에 있다.

| 시나리오 | 무엇을 하나 | port | 문서 |
|---|---|---|---|
| [set-model/](scenarios/set-model/) | 모델·로깅이 켜진 완성본. Track A narrative가 가리키는 환경 | 4000 | [2-setup.md](docs/2-setup.md) |
| [manual/](scenarios/manual/) | 빈 config로 띄우고 웹 UI에서 모델·key·team을 손수 등록 | 4010 | [manual/web-ui-setup.md](docs/manual/web-ui-setup.md) |
| [bedrock-cost/](scenarios/bedrock-cost/) | Bedrock 호출로 LiteLLM spend와 AWS 청구의 차이를 측정 | 4020 | [bedrock-cost/README.md](scenarios/bedrock-cost/README.md) |

Track B(폐쇄망)는 compose가 아니라 [terraform/](terraform/)으로 만든다. 절차는 [9-setup.md](docs/9-setup.md)에 있다.

## manual 트랙: 웹 UI로 손수 구성

| 문서 | 다루는 것 |
|---|---|
| [manual/web-ui-setup.md](docs/manual/web-ui-setup.md) | 웹 UI에서 모델 등록·virtual key·team·user 구성 |
| [scenarios/manual/docker-compose.md](scenarios/manual/docker-compose.md) | manual/ compose·env·volume·port·DB·UI 로그인 |

## bedrock-cost 트랙: 두 장부의 차이 측정

LiteLLM이 기록한 spend와 AWS가 청구한 금액은 같은 호출을 다르게 센다. 응답 캐시, Bedrock prompt caching, 끊긴 스트림이 어디서 얼마나 차이를 만드는지 $5 미만으로 측정한다.

| 문서 | 다루는 것 |
|---|---|
| [1-problem.md](scenarios/bedrock-cost/docs/1-problem.md) | 두 숫자가 다른 이유와 시나리오 4개, 예산 |
| [2-setup.md](scenarios/bedrock-cost/docs/2-setup.md) | Bedrock 호출용 IAM 키와 실습 환경 up·down |
| [3-scenarios.md](scenarios/bedrock-cost/docs/3-scenarios.md) | 시나리오 실행과 실측 기록표, input token 분해 |
| [4-why-different.md](scenarios/bedrock-cost/docs/4-why-different.md) | LiteLLM 소스와 이력으로 본 차이의 원인 |
| [5-litellm-dashboard.md](scenarios/bedrock-cost/docs/5-litellm-dashboard.md) | LiteLLM 콘솔·공식 Grafana 대시보드에서 token 파고들기 |
| [6-observe.md](scenarios/bedrock-cost/docs/6-observe.md) | Prometheus·Grafana로 두 장부 확인, AWS 권장 관찰 수단 |
| [v3.html](scenarios/bedrock-cost/docs/v3.html) | 구조와 두 장부 비교 다이어그램 |
| [visual.html](scenarios/bedrock-cost/docs/visual.html) | 실측값 표와 막대로 보는 차이 |
| [visual-v2.html](scenarios/bedrock-cost/docs/visual-v2.html) | 슬라이드형 애니메이션 |

## 실습 환경 코드

- [scenarios/](scenarios/) — 실습 환경 세 종. 디렉터리마다 독립이고 host port가 다르다. 목록과 간섭하지 않는 이유는 [scenarios/README.md](scenarios/README.md)
- [clients/](clients/) — Track A client 연동 예제. python-client.py, codex-config.toml. 절차는 [8-connect-clients.md](docs/8-connect-clients.md)
- [terraform/](terraform/) — Track B. private subnet + VPC endpoint + EC2 + ECR + Bedrock IAM. 준비 절차는 [9-setup.md](docs/9-setup.md)

## 같은 목적의 다른 gateway

Go 기반 고성능 대안 Bifrost는 형제 워크스페이스 [../bifrost/](../bifrost/)에서 다룬다. 폐쇄망 Terraform은 그쪽이 이 워크스페이스의 [terraform/](terraform/)를 재사용한다.

## agent용

- [AGENTS.md](AGENTS.md) — 이 워크스페이스를 수정하는 agent 맥락
- [adr/](adr/) — 의사결정 기록
- [for_agents/plan.md](for_agents/plan.md) — 최초 구현 plan
