# LiteLLM Proxy 확장 지점 핸즈온

LiteLLM Proxy를 로컬 환경에서 mock 모델로 기동하고, 요청이 통과하는 주요 확장 지점(Router, pre_call 훅, `complexity_router`, custom provider, `websearch_interception`)에 코드와 설정을 단계별로 추가하며 커스터마이징 원리를 검증하는 실습이다. 예제 도메인은 일반 Q&A 챗봇이며, 모든 단계는 외부 provider API 비용 없이 실행된다. 단, 4·5단계의 판정 모델만 로컬 Ollama(`gemma2:2b`, CPU 전용)에서 실제로 추론한다. 라우팅·인증·한도 등 기본 게이트웨이 기능은 [LiteLLM 핸즈온](../litellm/)에서 다룬다.

전체 요청 처리 흐름을 먼저 파악하려면 [9-lifecycle.md](docs/9-lifecycle.md)의 sequenceDiagram과 확장 지점 선택 표부터 확인한다.

## 문서 목록

| 단계 | 문서 | 다루는 확장 지점 |
| --- | --- | --- |
| 준비 | [1-setup.md](docs/1-setup.md) | uv 설치, Proxy·Postgres·Ollama·mock 검색 서버 기동 및 정리 |
| 1 | [2-proxy-basics.md](docs/2-proxy-basics.md) | `model_list`, `mock_response`, master key |
| 2 | [3-router.md](docs/3-router.md) | Router load balancing, retries, fallbacks 내부 동작 |
| 3 | [4-pre-call-hook.md](docs/4-pre-call-hook.md) | `async_pre_call_hook`, callbacks 문자열 로드, `spend_logs_metadata` |
| 4 | [5-ai-router.md](docs/5-ai-router.md) | 훅에서 로컬 소형 모델로 라우팅 대상 판정 및 CPU 전용 추론 지연 |
| 5 | [6-complexity-router.md](docs/6-complexity-router.md) | 내장 `auto_router/complexity_router`, 키워드 규칙, LLM 분류기, circuit breaker |
| 6 | [7-custom-provider.md](docs/7-custom-provider.md) | `custom_provider_map`, `CustomLLM`, `GenericStreamingChunk` |
| 7 | [8-websearch-interception.md](docs/8-websearch-interception.md) | 내장 `websearch_interception`과 gateway 주도 검색 방식 비교 |
| 8 | [9-lifecycle.md](docs/9-lifecycle.md) | 요청 라이프사이클, 확장 지점 선택 기준 |
| - | [troubleshooting.md](docs/troubleshooting.md) | 실습 중 발생한 문제와 해결 방법 |

## 주의: 실제 SearXNG 연동 시 유의사항

7단계는 로컬 mock 검색 서버(`scripts/mock_searxng.py`)만 사용하므로 외부로 검색 요청이 나가지 않는다. mock 서버 대신 실제 SearXNG 인스턴스를 연동할 때는 **요청 빈도를 1분에 5회 이하로 제한한다.** SearXNG는 Google 등 상위 검색 엔진에 질의를 대리 전송하므로, 반복 실행으로 요청이 집중되면 클라이언트 IP가 스팸 봇으로 차단될 수 있다.

## 코드 구성

| 경로 | 내용 |
| --- | --- |
| [config/](config/) | 단계별 Proxy 설정 파일 (`{단계}-{주제}.yaml`) |
| [gateway/](gateway/) | 훅과 custom provider 구현 코드 (`uv sync`로 패키지를 설치해 Proxy가 import) |
| [scripts/](scripts/) | 관찰용 스크립트 (Router 시도 순서 추적, 스트림 청크 타임라인 측정, mock 검색 서버) |
| [tests/](tests/) | 단계별 pytest 단위 테스트 (Router와 외부 호출은 fake 객체로 대체) |
| [compose.yaml](compose.yaml) | 3단계부터 spend log 저장에 사용하는 Postgres 설정 |
| [knowledge/](knowledge/index.md) | 핸즈온 설계 및 기술 의사결정 기록 |
