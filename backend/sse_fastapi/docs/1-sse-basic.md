# SSE는 언제 단순한 HTTP 응답과 달라질까?

## TL;DR

SSE는 서버가 브라우저나 클라이언트에 단방향 이벤트를 계속 밀어 넣고 싶을 때 쓰는 HTTP 기반 스트리밍 방식입니다. 요청-응답 한 번으로 끝나는 API가 아니라, 연결을 열어 둔 채 `text/event-stream` 형식의 메시지를 계속 보냅니다.

## 왜 HTTP 응답을 한 번에 끝내지 않을까요?

일반적인 HTTP API는 클라이언트가 요청하고 서버가 응답하면 연결의 목적이 끝납니다. 그런데 진행률, 알림, 로그, 서버 상태처럼 값이 계속 바뀌는 데이터는 클라이언트가 같은 요청을 반복해야 합니다.

SSE는 이 반복 요청을 줄입니다. 클라이언트가 `/events` 같은 엔드포인트에 한 번 연결하면 서버가 이벤트를 순서대로 흘려보냅니다. 브라우저에서는 `EventSource`가 이 연결을 관리하고, 연결이 끊기면 재연결도 시도합니다.

## WebSocket 대신 SSE를 쓰면 무엇을 얻고 무엇을 잃을까요?

SSE의 장점은 단순함입니다. HTTP 응답 스트림이라 서버 구현과 프록시 관찰이 비교적 쉽고, 브라우저 기본 API인 `EventSource`를 사용할 수 있습니다. 서버에서 클라이언트로만 흘러가는 알림이나 상태 변경에는 충분합니다.

단점은 양방향 통신이 아니라는 점입니다. 클라이언트가 서버로 계속 메시지를 보내야 하는 채팅, 협업 편집, 게임 같은 흐름은 WebSocket이 더 자연스럽습니다. SSE는 "서버가 계속 알려준다"는 문제에 맞고, "서로 계속 주고받는다"는 문제에는 맞지 않습니다.

## SSE 메시지는 어떤 모양일까요?

서버는 이벤트 하나를 여러 줄의 텍스트로 보냅니다. 마지막 빈 줄이 이벤트 하나의 끝입니다.

아래 예시는 서버가 `tick` 이벤트를 보내는 SSE 메시지입니다.

```text
id: 1
event: tick
data: {"id":1,"service":"local-sse-demo","message":"server event 1"}

```

`id`는 클라이언트가 마지막으로 받은 이벤트를 기억할 때 사용합니다. `event`는 이벤트 타입입니다. `data`는 클라이언트가 실제로 소비할 본문입니다.

## 참고자료

- MDN Web Docs, Server-sent events: <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events>
- FastAPI StreamingResponse: <https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse>
