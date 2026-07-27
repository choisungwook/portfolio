# ccproxy 핸즈온: Claude Code 앞에 세우는 AI proxy

Claude Code는 `ANTHROPIC_BASE_URL`이 가리키는 주소로 요청을 보낸다. 그 자리에 Anthropic Messages API를 흉내내는 서버를 두면 클라이언트는 모르는 채로 다른 모델에 붙는다. ccproxy 계열 도구가 하는 일은 결국 스키마 번역 하나이고, 이 워크스페이스는 그 번역기를 직접 만들어 프로토콜과 위험을 같이 본다. API key 없이 도는 가짜 upstream을 쓴다.

## 학습지

- [studysheet.html](studysheet.html) — 원리, 프로토콜 대조표, 활용처, 주의사항을 A4 한 장으로

## 문서

| 문서 | 내용 |
|---|---|
| [docs/1-why-ai-proxy.md](docs/1-why-ai-proxy.md) | AI proxy가 존재하는 이유와 활용처 |
| [docs/2-setup.md](docs/2-setup.md) | 실습 환경 준비: proxy + 가짜 upstream |
| [docs/3-protocol.md](docs/3-protocol.md) | Anthropic ↔ OpenAI 프로토콜 번역과 모델 라우팅 |
| [docs/4-cautions.md](docs/4-cautions.md) | 유출, 약관, 번역 손실, 운영 위험 |

## 실습 코드

- [compose.yaml](compose.yaml) — proxy(8082)와 가짜 upstream(9000)
- [proxy/proxy.py](proxy/proxy.py) — 번역기 본체. `python3 proxy/proxy.py --selftest`로 양방향 변환 검증
- [proxy/upstream.py](proxy/upstream.py) — OpenAI 호환 가짜 백엔드
- [client/client.py](client/client.py) — Anthropic 포맷 클라이언트

## 관련 워크스페이스

팀 단위 운영에 필요한 virtual key, 예산, failover, 감사 로그는 gateway 쪽 주제다.

- [../litellm/](../litellm/) — LiteLLM AI gateway
- [../bifrost/](../bifrost/) — Bifrost AI gateway
