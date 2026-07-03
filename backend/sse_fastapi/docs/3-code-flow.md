# FastAPI 코드는 어떤 흐름으로 이벤트를 보낼까?

## TL;DR

핵심은 `StreamingResponse`에 async generator를 연결하는 것입니다. generator가 SSE 문자열을 만들고 `await asyncio.sleep(...)`으로 간격을 두면, FastAPI가 열린 HTTP 응답으로 이벤트를 계속 흘려보냅니다.

## 왜 generator가 필요할까요?

SSE는 응답 본문을 한 번에 만들지 않습니다. 이벤트가 생길 때마다 조금씩 보내야 합니다. 그래서 `event_stream()`은 리스트를 반환하지 않고 문자열을 하나씩 `yield`합니다.

아래 함수는 이벤트 ID를 1부터 증가시키며 SSE 메시지를 계속 만듭니다.

```python
async def event_stream() -> AsyncIterator[str]:
  """Yield SSE messages until the client disconnects."""
  for event_id in count(1):
    yield encode_sse(event_id, event_payload(event_id))
    await asyncio.sleep(interval_seconds())
```

## 왜 `text/event-stream`이 중요할까요?

브라우저의 `EventSource`는 응답의 Content-Type이 SSE 스트림이라는 것을 알아야 합니다. FastAPI에서는 `StreamingResponse`의 `media_type`으로 지정합니다.

아래 엔드포인트는 `/events` 요청에 SSE 스트림을 반환합니다.

```python
@app.get("/events")
async def events() -> StreamingResponse:
  """Stream tick events with the text/event-stream content type."""
  headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  }
  return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)
```

`Cache-Control: no-cache`는 중간 캐시가 스트림을 캐시하지 않도록 돕습니다. `X-Accel-Buffering: no`는 Nginx 같은 프록시 뒤에서 응답 버퍼링을 끄는 데 쓰입니다. 모든 프록시가 같은 방식으로 동작하는지는 확인 필요입니다.

## 환경 변수로 바꿀 수 있는 값은 무엇일까요?

이 예제는 이벤트 간격과 서비스 이름만 환경 변수로 뺍니다. 실습에서 바꾸고 싶은 값은 명확하지만, 설정 수를 늘리면 코드가 읽기 어려워지기 때문입니다.

아래 값은 `docker-compose.yml`에서 바꿀 수 있습니다.

```yaml
environment:
  SSE_INTERVAL_SECONDS: "1"
  SSE_SERVICE_NAME: "local-sse-demo"
```

장점은 실습 중 이벤트 간격을 빠르게 바꿀 수 있다는 점입니다. 단점은 환경 변수가 늘어나면 작은 예제에서도 실제 중요한 흐름이 흐려질 수 있다는 점입니다.

## 참고자료

- FastAPI StreamingResponse: <https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse>
- MDN EventSource: <https://developer.mozilla.org/en-US/docs/Web/API/EventSource>
