# LiteLLM Proxy 확장 지점 핸즈온

LiteLLM Proxy를 로컬에서 mock 모델로 띄우고, 요청이 지나가는 확장 지점(Router, pre_call 훅, 콜백 체인, custom provider, 검색 도구, post_call 훅)에 코드를 하나씩 붙여 커스터마이징 원리를 확인한다. 예제 도메인은 일반 Q&A 챗봇이고, 모든 단계는 provider 비용 없이 돈다. 라우팅·인증·한도 같은 gateway 기초는 [LiteLLM 핸즈온](../litellm/)에서 다룬다.

전체 흐름을 먼저 보려면 [13-lifecycle.md](docs/13-lifecycle.md)의 sequenceDiagram과 확장 지점 표부터 읽는다.

## 문서

| 단계 | 문서 | 다루는 확장 지점 |
| --- | --- | --- |
| 준비 | [1-setup.md](docs/1-setup.md) | uv 설치, Proxy·Postgres·Valkey·mock 검색 서버 기동과 정리 |
| 1 | [2-proxy-basics.md](docs/2-proxy-basics.md) | `model_list`, `mock_response`, master key |
| 2 | [3-router.md](docs/3-router.md) | Router load balancing, retries, fallbacks 내부 동작 |
| 3 | [4-pre-call-hook.md](docs/4-pre-call-hook.md) | `async_pre_call_hook`, callbacks 문자열 로드, `spend_logs_metadata` |
| 4 | [5-keyword-router.md](docs/5-keyword-router.md) | 훅에서 모델 교체, 거짓 양성·음성 |
| 5 | [6-hook-order.md](docs/6-hook-order.md) | 콜백 체인 순서, metadata 표식 |
| 6 | [7-intent-chain.md](docs/7-intent-chain.md) | 프리필터 → 분류 모델 → 규칙, in-memory·Valkey 캐시 |
| 7 | [8-feature-switch.md](docs/8-feature-switch.md) | `tools` 표식으로 기능 켜기 |
| 8 | [9-custom-provider.md](docs/9-custom-provider.md) | `custom_provider_map`, `CustomLLM`, `GenericStreamingChunk` |
| 9 | [10-search-fallback.md](docs/10-search-fallback.md) | `search_tools`, `litellm.asearch`, 코드 폴백과 Router 폴백 |
| 10 | [11-websearch-interception.md](docs/11-websearch-interception.md) | 내장 `websearch_interception`과 gateway 주도 검색 비교 |
| 11 | [12-observability.md](docs/12-observability.md) | decision trail, post_call 훅, 원문을 남기지 않는 관측 |
| 12 | [13-lifecycle.md](docs/13-lifecycle.md) | 요청 라이프사이클, 확장 지점 선택표 |
| - | [troubleshooting.md](docs/troubleshooting.md) | 실습 중 겪은 문제와 해결 |

## 코드

| 경로 | 내용 |
| --- | --- |
| [config/](config/) | 단계별 Proxy config. `{단계}-{주제}.yaml` |
| [gateway/](gateway/) | 훅, custom provider, 검색 폴백 코드. `uv sync`가 패키지로 설치해 Proxy가 import한다 |
| [scripts/](scripts/) | 관찰 도구. Router 시도 순서, 스트림 청크 시각, 검색 방식 비교, mock 검색 서버 |
| [tests/](tests/) | 단계별 pytest. Router와 외부 호출은 fake로 대체 |
| [compose.yaml](compose.yaml) | 3단계부터 쓰는 Postgres, Valkey |
| [knowledge/](knowledge/index.md) | 이 핸즈온의 결정 기록 |
