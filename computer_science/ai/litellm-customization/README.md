# LiteLLM Proxy 확장 지점 핸즈온

LiteLLM Proxy를 로컬에서 mock 모델로 띄우고, 요청이 지나가는 확장 지점(Router, pre_call 훅, complexity_router, custom provider, websearch_interception)에 코드와 config를 하나씩 붙여 커스터마이징 원리를 확인한다. 예제 도메인은 일반 Q&A 챗봇이고, 모든 단계는 provider 비용 없이 돈다. 4·5단계의 판정 모델만 로컬 Ollama(`gemma2:2b`, CPU 전용)에서 실제로 돈다. 라우팅·인증·한도 같은 gateway 기초는 [LiteLLM 핸즈온](../litellm/)에서 다룬다.

전체 흐름을 먼저 보려면 [9-lifecycle.md](docs/9-lifecycle.md)의 sequenceDiagram과 확장 지점 표부터 읽는다.

## 문서

| 단계 | 문서 | 다루는 확장 지점 |
| --- | --- | --- |
| 준비 | [1-setup.md](docs/1-setup.md) | uv 설치, Proxy·Postgres·Ollama·mock 검색 서버 기동과 정리 |
| 1 | [2-proxy-basics.md](docs/2-proxy-basics.md) | `model_list`, `mock_response`, master key |
| 2 | [3-router.md](docs/3-router.md) | Router load balancing, retries, fallbacks 내부 동작 |
| 3 | [4-pre-call-hook.md](docs/4-pre-call-hook.md) | `async_pre_call_hook`, callbacks 문자열 로드, `spend_logs_metadata` |
| 4 | [5-ai-router.md](docs/5-ai-router.md) | 훅에서 로컬 소형 모델에게 보낼 모델 묻기, CPU 전용 판정의 지연 |
| 5 | [6-complexity-router.md](docs/6-complexity-router.md) | 내장 `auto_router/complexity_router`, 키워드 규칙, LLM 분류기, circuit breaker |
| 6 | [7-custom-provider.md](docs/7-custom-provider.md) | `custom_provider_map`, `CustomLLM`, `GenericStreamingChunk` |
| 7 | [8-websearch-interception.md](docs/8-websearch-interception.md) | 내장 `websearch_interception`과 gateway 주도 검색 비교 |
| 8 | [9-lifecycle.md](docs/9-lifecycle.md) | 요청 라이프사이클, 확장 지점 선택표 |
| - | [troubleshooting.md](docs/troubleshooting.md) | 실습 중 겪은 문제와 해결 |

## 주의: 실제 SearXNG를 붙일 때

7단계는 로컬 mock 검색 서버(`scripts/mock_searxng.py`)만 쓰므로 외부로 검색 요청이 나가지 않는다. mock 대신 실제 SearXNG 인스턴스를 붙인다면 **요청을 1분에 5회 이하로 유지한다.** SearXNG는 Google 같은 상위 검색 엔진에 요청을 대신 보내므로, 반복 실행으로 요청이 몰리면 내 IP가 스팸 봇으로 차단될 수 있다.

## 코드

| 경로 | 내용 |
| --- | --- |
| [config/](config/) | 단계별 Proxy config. `{단계}-{주제}.yaml` |
| [gateway/](gateway/) | 훅과 custom provider 코드. `uv sync`가 패키지로 설치해 Proxy가 import한다 |
| [scripts/](scripts/) | 관찰 도구. Router 시도 순서, 스트림 청크 시각, mock 검색 서버 |
| [tests/](tests/) | 단계별 pytest. Router와 외부 호출은 fake로 대체 |
| [compose.yaml](compose.yaml) | 3단계부터 쓰는 Postgres |
| [knowledge/](knowledge/index.md) | 이 핸즈온의 결정 기록 |
