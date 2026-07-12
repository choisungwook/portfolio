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

## manual 트랙: 웹 UI로 손수 구성

[install/set-model/](install/set-model/)이 config.yaml로 선언하는 방식이라면, [install/manual/](install/manual/)은 빈 gateway를 띄우고 웹 UI에서 모델·key·team을 손수 등록하는 방식이다. 절차는 [docs/manual/](docs/manual/)에 있다.

| 문서 | 다루는 것 |
|---|---|
| [manual/web-ui-setup.md](docs/manual/web-ui-setup.md) | 웹 UI에서 모델 등록·virtual key·team·user 구성 |
| [install/manual/docker-compose.md](install/manual/docker-compose.md) | manual/ compose·env·volume·port·DB·UI 로그인 |

## 실습 환경 코드

- [install/set-model/](install/set-model/) — Track A. LiteLLM proxy + Postgres, gpt·gemini 등록 + spend 로깅까지 켜진 완성본. `docker compose up`이면 바로 돈다. 준비 절차는 [2-setup.md](docs/2-setup.md)
- [install/manual/](install/manual/) — 깡통 gateway. 빈 config로 띄우고 [웹 UI 가이드](docs/manual/web-ui-setup.md)를 보며 모델·key를 UI에서 직접 등록한다
- [clients/](clients/) — Track A client 연동 예제. python-client.py, codex-config.toml. 절차는 [8-connect-clients.md](docs/8-connect-clients.md)
- [terraform/](terraform/) — Track B. private subnet + VPC endpoint + EC2 + ECR + Bedrock IAM. 준비 절차는 [9-setup.md](docs/9-setup.md)

## 같은 목적의 다른 gateway

Go 기반 고성능 대안 Bifrost는 형제 워크스페이스 [../bifrost/](../bifrost/)에서 다룬다. 폐쇄망 Terraform은 그쪽이 이 워크스페이스의 [terraform/](terraform/)를 재사용한다.

## agent용

- [AGENTS.md](AGENTS.md) — 이 워크스페이스를 수정하는 agent 맥락
- [adr/](adr/) — 의사결정 기록
- [for_agents/plan.md](for_agents/plan.md) — 최초 구현 plan
