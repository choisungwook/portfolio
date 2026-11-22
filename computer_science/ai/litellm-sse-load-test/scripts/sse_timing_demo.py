"""헤더를 먼저 보내고 시간차를 두고 SSE 이벤트를 쓰는 로컬 실습 서버."""

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from time import sleep


class SSEHandler(BaseHTTPRequestHandler):
  """GET /events에 헤더 하나와 텍스트 이벤트 세 개를 반환한다."""

  protocol_version = "HTTP/1.1"

  def do_GET(self) -> None:  # noqa: N802
    """헤더를 즉시 전송한 뒤, 준비되는 이벤트를 하나씩 보낸다."""
    if self.path != "/events":
      self.send_error(HTTPStatus.NOT_FOUND)
      return

    self.send_response(HTTPStatus.OK)
    self.send_header("Content-Type", "text/event-stream; charset=utf-8")
    self.send_header("Connection", "close")
    self.end_headers()
    self.wfile.flush()

    for wait, lines in [(2.0, ("hello", "world")), (0.5, ("next",)), (0.5, ("last",))]:
      sleep(wait)
      event = "".join(f"data: {line}\n" for line in lines) + "\n"
      self.wfile.write(event.encode("utf-8"))
      self.wfile.flush()


if __name__ == "__main__":
  with HTTPServer(("127.0.0.1", 8008), SSEHandler) as server:
    print("SSE demo at http://127.0.0.1:8008/events", flush=True)
    try:
      server.serve_forever()
    except KeyboardInterrupt:
      pass
