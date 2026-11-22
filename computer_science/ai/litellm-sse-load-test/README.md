# 로컬 AI 모델 성능테스트 핸즈온

모델 추론 API도 일반 웹 API처럼 HTTP로 부하테스트할 수 있습니다. 기본 k6로 응답 지연, 오류율, 초당 요청 수를 측정하고, 스트리밍 채팅의 첫 텍스트 지연과 토큰 처리량까지 측정 범위를 넓힙니다.

M3 Pro에서 Ollama가 `qwen2.5:1.5b`를 실행합니다. LiteLLM은 모델을 OpenAI 호환 HTTP 엔드포인트로 노출하는 중간 게이트웨이입니다. 실습 수치는 클라이언트에서 게이트웨이와 추론 서버를 거쳐 관측한 결과입니다.

## 30분 실습 순서

먼저 익숙한 HTTP 지표로 기준선을 잡고, 2단계에서 SSE(Server-Sent Events) 이론과 코드를 읽은 뒤 스트리밍을 관찰합니다. 표의 시간은 명령 실행과 결과 확인 기준이며 읽기, 질의응답, 첫 도구 설치와 다운로드 시간은 별도입니다.

| 단계 | 문서 | 다루는 내용 |
| --- | --- | --- |
| 1.1 | [기능 지도](docs/1.1-overview.md) | 시나리오 순서와 지표를 확인합니다. |
| 준비 (5분) | [환경 준비](docs/setup.md) | Ollama, LiteLLM, 요청 로그를 저장할 PostgreSQL을 기동합니다. |
| 1.2 (3분) | [기본 HTTP 부하테스트](docs/1.2-http-baseline.md) | curl로 요청·응답 한 건을 확인한 뒤 k6로 지연·오류율·요청 처리량을 기록합니다. |
| 2.1 | [SSE 이론](docs/2.1-sse-theory.md) | HTTP 응답 본문의 이벤트 형식과 경계를 읽습니다. |
| 2.2 | [SSE 비교 코드 해설](docs/2.2-sse-code.md) | 코드에서 요청 전송, 본문 수신, 지연 측정 지점을 찾습니다. |
| 2.3 (5분) | [SSE 실습](docs/2.3-sse-vs-http.md) | 같은 API에서 응답 형식, 첫 텍스트 도착 시각, 전체 완료 시간을 비교합니다. |
| 3 (5분) | [SSE에 기본 k6 적용](docs/3-k6-pitfalls.md) | 스트리밍 요청에서도 HTTP 지표를 수집하고, 부하 모델과 답변 길이의 영향을 확인합니다. |
| 4 (4분) | [xk6-sse](docs/4-xk6-sse.md) | 첫 텍스트와 평균 청크 간격을 부하테스트에서 측정합니다. |
| 5 (확장) | [벤치마크 도구 비교](docs/5-llm-benchmark-tools.md) | AIPerf와 GuideLLM의 측정 방식과 결과를 비교합니다. |
| 6 (8분) | [GuideLLM 동시성 스윕](docs/6-guidellm-handson.md#1-동시성-단계별-스윕124과-htmljson-리포트-생성) | 동시성 1→2→4에서 지연과 처리량을 비교합니다. |

## 부록

| 문서 | 다루는 내용 |
| --- | --- |
| [부록 A. SSE 헤더와 첫 이벤트의 시차](docs/appendix-a-sse-timing.md) | 로컬 서버와 curl로 헤더·이벤트 수신 간격과 빈 줄 경계를 재현합니다. |
| [부록 B. Grafana로 HTTP JSON과 SSE 비교](docs/appendix-b-grafana-dashboard.md) | 사용자 수와 요청 건수별 HTTP JSON·SSE 지연을 대조합니다. |
| [부록 C. 게이트웨이 요청 로그 추적](docs/appendix-c-gateway-logs.md) | Call ID로 두 요청을 LiteLLM 대시보드에서 찾습니다. |
| [Mooncake Trace 리플레이](docs/6-guidellm-handson.md#2-mooncake-trace-파일-구조-확인과-리플레이-실행) | 기록된 요청의 도착 시각과 입출력 길이를 재생합니다. |
| [문제 해결](docs/troubleshooting.md) | 실습 중 겪은 문제와 해결 방법을 확인합니다. |

## 코드 구성

| 경로 | 내용 |
| --- | --- |
| [compose.yaml](compose.yaml#L3-L28) | 요청 로그를 저장하는 PostgreSQL과 LiteLLM Proxy 기동 설정 |
| [config/litellm-config.yaml](config/litellm-config.yaml) | 호스트 Ollama(`qwen2.5:1.5b`)를 OpenAI 호환 모델 `local-qwen`으로 연결하는 설정 |
| [scripts/compare_http_sse.py](scripts/compare_http_sse.py#L165-L170) | 비스트리밍과 SSE의 지연을 비교하고 대시보드 조회용 Call ID를 출력하는 스크립트 |
| [k6/](k6/) | HTTP 기준선(`00`), 스트리밍의 HTTP 지표와 부하 모델(`01`~`03`), SSE 이벤트 지표(`04`) |
| [benchmarks/](benchmarks/) | NVIDIA AIPerf와 GuideLLM 실행 스크립트 |
| [knowledge/](knowledge/index.md) | 핸즈온 설계 의사결정 기록 |
