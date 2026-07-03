# SSE 서버는 왜 HTTP 응답을 끝내지 않을까

HTTP API는 보통 요청을 받으면 응답을 만들고 연결을 끝냅니다. 그런데 실시간 알림이나 작업 진행률처럼 서버가 나중에 생기는 이벤트를 계속 보내야 하는 경우에는 이 방식이 답답해집니다. SSE는 왜 응답을 한 번에 끝내지 않고 계속 열어둘까요?

## SSE는 WebSocket을 대신하는 기술일까

SSE(Server-Sent Events)는 서버가 클라이언트에게 이벤트를 계속 보내기 위한 HTTP 기반 스트리밍 방식입니다. 클라이언트가 `GET /events` 같은 요청을 보내면 서버는 `text/event-stream` 응답을 시작하고, 응답 본문에 이벤트를 한 줄씩 추가합니다.

이 방식은 WebSocket을 완전히 대신하지 않습니다. WebSocket은 양방향 통신에 어울리고, SSE는 서버에서 클라이언트로 보내는 단방향 이벤트에 어울립니다. 장점은 HTTP 응답 모델을 그대로 사용하므로 프록시, 로그, 인증 같은 기존 웹 인프라와 맞추기 쉽다는 점입니다. 단점은 클라이언트에서 서버로 계속 메시지를 보내야 하는 채팅형 흐름에는 맞지 않는다는 점입니다.

**SSE는 양방향 채널이 아니라, 서버가 상태 변화를 계속 흘려보내는 단방향 HTTP 스트림입니다.**

## FastAPI에서는 왜 StreamingResponse를 사용할까

FastAPI에서 SSE를 만들 때는 한 번에 완성된 JSON을 반환하지 않고 `StreamingResponse`를 사용합니다. 응답을 만드는 함수가 문자열을 하나씩 `yield`하면 ASGI 서버가 그 조각을 클라이언트로 전송합니다.

이 실습의 서버는 이벤트를 다음 형식으로 보냅니다.

```text
id: 1
event: tick
data: {"event_id": 1, "message": "server event stream is alive"}
```

SSE 메시지는 빈 줄로 이벤트 하나가 끝납니다. `id`는 클라이언트가 마지막으로 받은 이벤트를 추적할 때 쓰고, `event`는 이벤트 종류를 구분하며, `data`는 실제 payload입니다.

## 응답 헤더는 왜 중요할까

SSE 응답의 핵심 헤더는 `Content-Type: text/event-stream`입니다. 여기에 `Cache-Control: no-cache`와 `X-Accel-Buffering: no`를 함께 둡니다.

캐시가 끼면 클라이언트가 최신 이벤트를 바로 받지 못할 수 있습니다. 프록시 버퍼링이 켜져 있으면 서버가 이벤트를 하나씩 보내도 중간 계층이 모아서 한 번에 내려줄 수 있습니다. 로컬 Docker Compose에서는 이 차이가 크게 보이지 않을 수 있지만, 운영 환경에서는 프록시와 로드밸런서 설정 때문에 SSE가 멈춘 것처럼 보일 수 있습니다.

정리하면, SSE 서버가 HTTP 응답을 끝내지 않는 이유는 이벤트가 생기는 순간마다 같은 연결 위로 데이터를 추가하기 위해서입니다. FastAPI에서는 `StreamingResponse`가 이 모델을 직접 표현해 줍니다.
