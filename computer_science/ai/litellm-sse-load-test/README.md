# LiteLLM Chat SSE 부하테스트 핸즈온

LiteLLM Proxy(`v1.110.2`)와 로컬 Ollama(`qwen2.5:1.5b`) 환경에서 일반 HTTP와 SSE(Server-Sent Events)의 차이를 5~10분 안에 직접 비교하고, 기본 `k6/http`로 Chat SSE를 부하테스트할 때 지표가 어떻게 왜곡되는지 실험으로 확인하는 핸즈온입니다. `xk6-sse`로 k6에서 TTFT와 TPOT를 보완 측정한 뒤, 현역 LLM 전용 벤치마크 도구인 NVIDIA AIPerf와 GuideLLM 결과와 나란히 대조합니다.

전체 흐름과 시나리오별 목표를 먼저 파악하려면 [1-overview.md](docs/1-overview.md)부터 읽습니다.

## 문서 목록

| 단계 | 문서 | 다루는 내용 |
| --- | --- | --- |
| 준비 | [setup.md](docs/setup.md) | Ollama 확인, LiteLLM Proxy(`v1.110.2`) 기동·정리, k6·uv·`xk6-sse` 준비 |
| 1 | [1-overview.md](docs/1-overview.md) | 기능 지도, 도구별 용어 대조, 사업팀·입문자용 SLO 기준표 |
| 2 | [2-sse-vs-http.md](docs/2-sse-vs-http.md) | 5~10분 배경지식 실습: 일반 HTTP(`stream: false`)와 Chat SSE(`stream: true`) 비교 |
| 3 | [3-k6-pitfalls.md](docs/3-k6-pitfalls.md) | 기본 `k6/http`로 Chat SSE 부하테스트 시 발생하는 5가지 지표 왜곡 실측 |
| 4 | [4-xk6-sse.md](docs/4-xk6-sse.md) | `xk6-sse`와 `constant-arrival-rate`로 TTFT·TPOT 보완 측정과 역할 경계 |
| 5 | [5-llm-benchmark-tools.md](docs/5-llm-benchmark-tools.md) | LLMPerf 대신 AIPerf·GuideLLM을 쓰는 이유와 실측 결과 비교 |
| 6 | [6-guidellm-handson.md](docs/6-guidellm-handson.md) | GuideLLM 실전 핸즈온: 동시성 스윕·HTML 리포트·Mooncake Trace 리플레이 |
| - | [troubleshooting.md](docs/troubleshooting.md) | 실습 중 겪은 문제와 해결 방법 |

## 코드 구성

| 경로 | 내용 |
| --- | --- |
| [compose.yaml](compose.yaml) | 보안 패치된 LiteLLM Proxy(`ghcr.io/berriai/litellm:v1.110.2`) 기동 설정 |
| [config/litellm-config.yaml](config/litellm-config.yaml) | 호스트 Ollama(`qwen2.5:1.5b`)를 OpenAI 호환 모델 `local-qwen`으로 연결하는 설정 |
| [scripts/compare_http_sse.py](scripts/compare_http_sse.py) | 일반 HTTP와 SSE 응답의 TTFB·TTFT·TPOT·E2E를 터미널에 실시간 비교하는 스크립트 |
| [k6/](k6/) | 기본 `k6/http` 왜곡 재현 스크립트(`01`~`03`)와 `xk6-sse` 보완 스크립트(`04`) |
| [benchmarks/](benchmarks/) | NVIDIA AIPerf와 GuideLLM 실행 스크립트 |
| [knowledge/](knowledge/index.md) | 핸즈온 설계 의사결정 기록 |
