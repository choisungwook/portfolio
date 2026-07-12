# Bifrost AI gateway 학습 핸즈온

Bifrost는 Maxim이 만든 Go 기반 AI gateway로, LiteLLM과 목적이 같은 고성능 대안이다. 이 워크스페이스는 LiteLLM을 먼저 배운 사람이 "무엇이 같고 무엇이 다른지"만 짚어 Bifrost로 넘어가도록 구성했다. 로컬 docker로 라우팅·거버넌스를 다루고, 폐쇄망은 옆 LiteLLM 워크스페이스의 인프라를 재사용한다.

## 사전

먼저 [../litellm/](../litellm/)에서 AI gateway의 개념(라우팅, virtual key, 한도, 폐쇄망)을 익히면 이 track이 훨씬 빠르게 읽힌다. 폐쇄망 Terraform도 그쪽 것을 공용으로 쓴다.

## 문서

환경 준비는 `-setup.md`로 분리했고, 내용 문서는 거기에 링크만 건다.

| 문서 | 내용 |
|---|---|
| [docs/1-litellm-vs-bifrost.md](docs/1-litellm-vs-bifrost.md) | LiteLLM과의 비교, 언제 무엇을 고르나 |
| [docs/2-setup.md](docs/2-setup.md) | 로컬 실습 환경 준비: Bifrost 단일 컨테이너 |
| [docs/3-routing.md](docs/3-routing.md) | config.json으로 GPT·Gemini 라우팅 |
| [docs/4-governance.md](docs/4-governance.md) | virtual key 3계층 거버넌스 |
| [docs/5-airgapped-bedrock.md](docs/5-airgapped-bedrock.md) | 폐쇄망 인프라 재사용 + Bedrock |

## 실습 환경 코드

- [docker/](docker/) — Bifrost 단일 컨테이너(SQLite 내장). 준비 절차는 [docs/2-setup.md](docs/2-setup.md)
- 폐쇄망 인프라는 [../litellm/terraform/](../litellm/terraform/)를 재사용한다(gateway와 무관하게 동일). 구축 절차는 [../litellm/docs/6-setup.md](../litellm/docs/6-setup.md)

## agent용

- [AGENTS.md](AGENTS.md) — 이 워크스페이스를 수정하는 agent 맥락
- [adr/](adr/) — 의사결정 기록
