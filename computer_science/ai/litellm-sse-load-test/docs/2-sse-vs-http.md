# 시나리오 2. 5~10분 배경지식 실습: 일반 HTTP와 Chat SSE 비교

이 문서는 AI 채팅 서비스가 일반 HTTP 응답(`stream: false`) 대신 SSE(`stream: true`)를 쓰는 이유를 5~10분 안에 직접 실행해 눈으로 확인하는 입문 실습입니다.

## 이 시나리오의 목표

| 항목 | 내용 |
| --- | --- |
| 기능 | OpenAI 호환 `/v1/chat/completions`에서 논스트리밍(일반 HTTP)과 스트리밍(SSE) 응답 방식 비교 |
| 쓰는 도구 | `curl`, `uv`, [compare_http_sse.py](../scripts/compare_http_sse.py), LiteLLM Proxy, Ollama |
| 입력 | 동일한 한국어 질문 1건 (`max_tokens: 120`, `temperature: 0.2`) |
| 작업 | 1. `curl -N`으로 raw SSE 청크 확인 -> 2. Python 스크립트로 HTTP vs SSE 체감·지표 동시 비교 |
| 달성할 것 | `stream: false`에서는 TTFT와 E2E가 같아지고, `stream: true`에서는 TTFT와 TPOT가 분리됨을 숫자로 확인 |

## 이 기능이 무엇인가

LLM은 문장을 한 번에 완성하지 않습니다. 입력 프롬프트를 한 번에 읽어 첫 토큰을 만드는 **Prefill 단계**와, 그 뒤 토큰을 하나씩 순차적으로 덧붙이는 **Decode 단계**로 동작합니다.

일반 HTTP(`stream: false`)는 서버가 마지막 토큰까지 전부 생성한 뒤 JSON 문서 한 덩어리를 응답합니다. 반면 **SSE(Server-Sent Events, `stream: true`)**는 HTTP 연결 하나를 열어 두고, 서버가 토큰을 1개 생성할 때마다 `data: {...}` 형식의 텍스트 청크를 클라이언트로 즉시 밀어 보냅니다.

오해하기 쉬운 경계 두 가지를 먼저 짚습니다.

- **이 실습이 다루는 것**: 클라이언트와 API Gateway(LiteLLM) 관점에서 `application/json` 단일 응답과 `text/event-stream` 청크 스트림이 네트워크와 지연 지표(TTFB, TTFT, TPOT, E2E)에 만드는 차이입니다.
- **이 실습이 다루지 않는 것**: 추론 엔진 내부의 continuous batching과 KV 캐시 스케줄링 구현입니다. 서빙 엔진 내부 구현은 [study-llmserving Chapter 3 Streaming](../../study-llmserving/ch3/04_streaming/README.md)에서 다룹니다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
| --- | --- | --- |
| SSE (Server-Sent Events) | HTTP 위에서 서버가 클라이언트로 단방향 텍스트 이벤트를 실시간 전송하는 프로토콜 | 응답 헤더 `Content-Type: text/event-stream; charset=utf-8` |
| TTFB (Time To First Byte) | 요청 전송 후 HTTP 응답 헤더의 첫 바이트가 도착하기까지 걸린 시간 | SSE 모드에서 `115.1 ms` |
| TTFT (Time To First Token) | 요청 전송 후 사용자가 볼 수 있는 첫 텍스트 토큰이 도착하기까지 걸린 시간 | HTTP `2271.4 ms` vs SSE `115.3 ms` |
| TPOT / ITL | 첫 토큰 이후 다음 토큰 하나가 도착하는 평균 간격(Time Per Output Token / Inter-Token Latency) | SSE 모드에서 `18.4 ms` (초당 약 54토큰) |
| E2E Latency | 요청 시작부터 마지막 토큰 생성 완료까지 걸린 전체 시간 | HTTP `2271.4 ms` vs SSE `2242.1 ms` |

## 이 기능을 시스템이 제공해야 하는 이유

실시간 챗봇에서 `stream: false`를 쓰면 모델이 500토큰을 생성하는 10초 동안 화면이 완전히 멈춥니다. 사용자는 서비스가 고장 났다고 판단해 새로고침하거나 이탈합니다.

성능 측정 관점에서는 더 치명적인 문제가 생깁니다. `stream: false`에서는 모든 답변이 완성된 뒤에 한 번에 응답이 도착하므로, 클라이언트 입장에서는 **TTFT가 곧 E2E Latency와 같아집니다.** 첫 글자가 늦는 원인이 프롬프트 처리(Prefill) 병목인지, 토큰 생성 속도(Decode) 저하인지 클라이언트에서 분리할 방법이 없습니다.

> [!NOTE]
> 자체 서빙하는 vLLM 환경이라면 논스트리밍 요청이라도 서버 내부의 Prometheus 메트릭(`vllm:time_to_first_token_seconds` 등)으로 엔진 기준 TTFT를 볼 수 있습니다. 그러나 여기에는 네트워크와 게이트웨이 대기 시간이 빠지고, AWS Bedrock이나 GCP Vertex AI 같은 관리형 API에서는 엔진 내부 메트릭에 접근할 수 없습니다. 따라서 클라이언트 측 정밀 측정에는 `stream: true`가 필수입니다.

## 대안 비교

실시간 LLM 응답 전달 방식 세 가지를 비교합니다.

| 구분 | 일반 HTTP (`stream: false`) | SSE (`stream: true`) | WebSocket |
| --- | --- | --- | --- |
| 응답 헤더 | `application/json` | `text/event-stream` | HTTP Upgrade (`101 Switching Protocols`) |
| 통신 방향 | 단발 요청·응답 | 서버 -> 클라이언트 단방향 스트림 | 양방향 전이중 통신 |
| TTFT 클라이언트 측정 | 불가 (TTFT = E2E) | 첫 텍스트 청크 도착 시점으로 정밀 측정 | 가능 |
| TPOT / ITL 측정 | 불가 (단순 평균 근사만 가능) | 각 토큰 청크 간 시간 차로 정밀 측정 | 가능 |
| 프록시·방화벽 호환성 | 높음 | 높음 (표준 HTTP/HTTPS 그대로 통과) | 별도 Upgrade 설정 필요 |
| 적합한 서비스 | 배치 요약, JSON 구조화 추출 | 실시간 챗봇, AI 에이전트, 코딩 어시스턴트 | 음성 실시간 대화 (OpenAI Realtime API 등) |

## 컴포넌트 역할

| 컴포넌트 | 역할 |
| --- | --- |
| 클라이언트 (`curl`, Python) | `stream: false`와 `stream: true` 요청을 보내고 각 이벤트 도착 시각을 기록 |
| LiteLLM Proxy (`localhost:4000`) | OpenAI 호환 `/v1/chat/completions` 요청을 받아 백엔드 Ollama 프로토콜로 변환·중계 |
| Ollama (`qwen2.5:1.5b`) | 프롬프트 Prefill 후 토큰을 하나씩 Decode하여 스트림 또는 완성 JSON으로 반환 |

## 흐름

아래 시퀀스는 같은 질문이라도 `stream: false`와 `stream: true`에서 클라이언트가 첫 글자를 받는 시점이 어떻게 갈리는지 보여줍니다.

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant L as LiteLLM Proxy
  participant O as Ollama (qwen2.5:1.5b)

  Note over C,O: [1] 일반 HTTP (stream: false)
  C->>L: POST /v1/chat/completions (stream: false)
  L->>O: 추론 요청
  O-->>O: Prefill + 전체 토큰 Decode (약 2.2초)
  O-->>L: 완성된 JSON 1건
  L-->>C: HTTP 200 application/json (TTFT = E2E = 2271ms)

  Note over C,O: [2] Chat SSE (stream: true)
  C->>L: POST /v1/chat/completions (stream: true)
  L->>O: 스트리밍 추론 요청
  O-->>L: 첫 토큰 청크 (Prefill 완료)
  L-->>C: HTTP 200 text/event-stream + data: 첫 토큰 (TTFT = 115ms)
  loop 나머지 토큰 생성 (약 18ms 간격)
    O-->>L: 다음 토큰 청크
    L-->>C: data: {"choices":[{"delta":{"content":"..."}}]}
  end
  L-->>C: data: [DONE] (E2E = 2242ms)
```

## 실습

환경 준비가 되어 있지 않다면 먼저 [setup.md](setup.md)의 1~2단계를 완료해 LiteLLM Proxy를 띄웁니다.

### 1. curl로 raw SSE 스트림 형식 확인

`-N` 옵션은 curl의 출력 버퍼링을 끄고 서버가 보낸 청크를 즉시 터미널에 찍습니다. 아래 명령으로 `stream: true` 요청을 보내 실제 네트워크 위로 흘러오는 SSE 프레임 구조를 확인합니다.

```bash
cd computer_science/ai/litellm-sse-load-test
curl -i -N -sS http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-local-litellm-test" \
  -d '{
    "model": "local-qwen",
    "messages": [{"role": "user", "content": "SSE를 한 문장으로 설명해 주세요."}],
    "max_tokens": 40,
    "stream": true
  }'
```

응답 상단의 `content-type: text/event-stream; charset=utf-8` 헤더와, 이어서 `data:`로 시작하는 JSON 줄이 한 토큰씩 흘러나오고 마지막에 `data: [DONE]`으로 닫히는 것을 확인합니다.

```text
HTTP/1.1 200 OK
content-type: text/event-stream; charset=utf-8
...

data: {"id":"chatcmpl-...","choices":[{"index":0,"delta":{"role":"assistant","content":"SSE"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","choices":[{"index":0,"delta":{"content":"는"},"finish_reason":null}]}
...
data: [DONE]
```

### 2. 일반 HTTP와 Chat SSE 체감·지표 동시 비교

이제 [compare_http_sse.py](../scripts/compare_http_sse.py)를 실행해 같은 질문을 `stream: false`와 `stream: true`로 연달아 호출합니다. 최초 1회 실행은 Ollama가 모델을 메모리에 올리는 콜드 로드(Warm-up) 시간이 포함되므로, 두 번 실행해 두 번째 결과를 기준으로 비교합니다.

```bash
cd computer_science/ai/litellm-sse-load-test
uv run scripts/compare_http_sse.py
uv run scripts/compare_http_sse.py
```

1회차(워밍업 미포함)에서는 모델 로딩 때문에 HTTP 응답이 `6813.7 ms`까지 길어집니다. 모델이 메모리에 올라간 2회차 실측 결과는 다음과 같습니다.

```text
=== 비교 요약 ===
지표                   | HTTP (stream: false)     | SSE (stream: true)      
--------------------------------------------------------------------------
Content-Type         | application/json         | text/event-stream; charset=utf-8
TTFB (헤더 도착)         |                2271.0 ms |                 115.1 ms
TTFT (첫 글자)          |                2271.4 ms |                 115.3 ms
TPOT (토큰 간격)         |              측정 불가 (N/A) |                  18.4 ms
E2E (전체 완료)          |                2271.4 ms |                2242.1 ms
수신 청크 수              |                        1 |                      115
```

실측 숫자가 보여주는 핵심은 세 가지입니다.

![일반 HTTP와 Chat SSE 타임라인 실측 비교](../imgs/http-vs-sse-timeline.png)

1. **전체 생성 시간(E2E)은 거의 같습니다.** HTTP가 `2271.4 ms`, SSE가 `2242.1 ms`로 모델이 답변을 끝까지 만드는 데 걸리는 시간은 동일합니다.
2. **첫 글자 체감 속도(TTFT)는 20배 가까이 차이 납니다.** HTTP에서는 `2271.4 ms` 동안 화면이 멈춰 있었지만, SSE에서는 `115.3 ms` 만에 첫 글자가 뜨고 이후 `18.4 ms` 간격(초당 약 54토큰)으로 115개 청크가 이어집니다.
3. **워밍업 제외가 필수입니다.** 1회차(`6813.7 ms`)와 2회차(`2271.4 ms`)의 차이가 3배에 달합니다. 본 측정 전에는 반드시 워밍업 요청을 먼저 흘려보내야 합니다.

## 부록. 실무에서 얻는 것

- **채팅 UI와 게이트웨이 부하테스트는 반드시 `stream: true`로 맞춥니다.** 서비스가 채팅 스트리밍을 쓰는데 부하테스트를 `stream: false`로 돌리면 사용자가 겪는 TTFT 병목과 중간 버퍼링 문제를 전혀 발견하지 못합니다.
- **리버스 프록시(Nginx, ALB, API Gateway) 버퍼링에 주의합니다.** 중간 프록시가 응답 버퍼링을 켜 두면 백엔드가 SSE로 115개 청크를 보내도 클라이언트는 마지막에 한 번에 받아 사실상 `stream: false`처럼 동작합니다. `curl -N`으로 첫 청크가 즉시 찍히는지 먼저 확인하는 습관이 안전합니다.

## 참고 문서

1. [MDN - Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
2. [OpenAI API Reference - Create chat completion (stream)](https://platform.openai.com/docs/api-reference/chat/create)
