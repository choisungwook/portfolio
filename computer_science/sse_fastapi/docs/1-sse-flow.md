# SSE는 왜 HTTP 응답을 끝내지 않을까

웹 화면에서 알림, 진행률, 로그처럼 서버 쪽 변화가 계속 표시되어야 할 때가 있습니다. 그런데 클라이언트가 매초 API를 다시 호출하는 방식은 단순하지만 요청 수가 늘고, 변경이 없을 때도 계속 같은 질문을 반복합니다. 그러면 서버가 HTTP 응답을 일부러 끝내지 않고 계속 이벤트를 흘려보내는 방식은 언제 의미가 있을까요?

## SSE는 무엇을 단순하게 만들까

SSE(Server-Sent Events)는 서버가 브라우저로 텍스트 이벤트를 계속 보내는 HTTP 기반 스트리밍 방식입니다. 클라이언트는 `EventSource`로 연결하고, 서버는 `text/event-stream` 응답을 열어 둔 채 `data:` 라인을 반복해서 보냅니다.

이 구조의 장점은 HTTP 위에서 동작한다는 점입니다. 별도 프로토콜 업그레이드 없이 일반 API 서버와 비슷하게 배포할 수 있고, 브라우저에는 표준 `EventSource` 클라이언트가 있습니다. 반대로 단점도 분명합니다. SSE는 기본적으로 서버에서 클라이언트로 흐르는 단방향 통신입니다. 클라이언트가 서버로 자주 메시지를 보내야 한다면 일반 HTTP 요청을 따로 보내거나 WebSocket을 검토해야 합니다.

**즉 SSE는 양방향 채팅보다 서버 상태를 계속 보여주는 화면에 더 잘 맞습니다.**

## 왜 응답 헤더가 중요할까

SSE 응답은 일반 JSON API처럼 한 번에 끝나지 않습니다. 그래서 클라이언트와 중간 프록시가 이 응답을 버퍼링하지 않도록 의도를 명확히 드러내야 합니다.

이 실습 서버는 다음 헤더를 반환합니다.

```text
content-type: text/event-stream; charset=utf-8
cache-control: no-cache
connection: keep-alive
x-accel-buffering: no
```

`text/event-stream`은 브라우저가 이 응답을 SSE 스트림으로 해석하게 만듭니다. `no-cache`는 이벤트 스트림을 캐시 대상으로 보지 않게 합니다. `keep-alive`는 연결을 유지하는 의도를 보여줍니다. 운영 환경에서는 Nginx, ALB, CDN 같은 중간 계층의 buffering, idle timeout, response timeout도 같이 봐야 합니다. 이 저장소의 로컬 실습은 그중 애플리케이션 레벨 흐름만 다룹니다.

## WebSocket 대신 SSE를 쓰면 무엇을 얻고 무엇을 잃을까

SSE를 선택하면 구현과 관찰이 단순해집니다. 브라우저는 `EventSource`만 만들면 되고, 서버는 HTTP streaming response를 반환하면 됩니다. 재연결도 브라우저가 기본적으로 처리합니다.

하지만 SSE는 메시지를 클라이언트에서 서버로 같은 연결에 실어 보내지 않습니다. 인증 토큰 갱신, 사용자의 입력 이벤트, 명령 전송 같은 요구가 커지면 구조가 어색해질 수 있습니다. 이때는 HTTP POST를 별도로 붙이는 방식과 WebSocket으로 전환하는 방식 사이에서 선택해야 합니다.

| 선택 | 장점 | 단점 |
|---|---|---|
| SSE | HTTP 기반이라 단순하고 브라우저 기본 지원이 있다 | 단방향 통신에 가깝고 중간 프록시 timeout 확인이 필요하다 |
| WebSocket | 양방향 실시간 통신에 적합하다 | 연결 관리, 배포, 관측 방식이 더 복잡해진다 |
| Polling | 구현이 가장 직관적이다 | 변경이 없어도 요청이 반복되고 지연과 부하 사이의 타협이 필요하다 |

## 이 실습은 무엇을 확인할까

이 실습은 세 가지를 확인합니다.

1. FastAPI가 `StreamingResponse`로 SSE frame을 계속 보낼 수 있는가
2. 브라우저 `EventSource`가 이벤트를 순서대로 표시하는가
3. `curl -N`으로 응답 헤더와 이벤트 스트림을 직접 볼 수 있는가

정리하면, SSE가 HTTP 응답을 끝내지 않는 이유는 서버의 변화가 생길 때마다 새 요청을 만들지 않고 같은 연결로 계속 전달하기 위해서입니다. 그래서 SSE는 "서버가 알려주는 단방향 상태 변화"를 단순하게 만들지만, 양방향 요구가 커지는 순간 다른 선택지도 같이 비교해야 합니다.

## 참고자료

- [MDN - Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [FastAPI - Custom Response and StreamingResponse](https://fastapi.tiangolo.com/advanced/custom-response/)
