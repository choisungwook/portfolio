import json
import logging
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

IMAGE_VERSION = Path(__file__).with_name("image-version.txt").read_text().strip()
APP_ENV = os.environ.get("APP_ENV", "dev")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").upper()
logging.basicConfig(level=LOG_LEVEL, format="%(levelname)s %(message)s")


class HelloHandler(BaseHTTPRequestHandler):
  """표준 라이브러리만 사용하는 hello와 health HTTP 응답."""

  def do_GET(self) -> None:
    """요청 경로에 맞는 JSON 상태와 본문 반환."""
    logging.debug("request path=%s app_env=%s", self.path, APP_ENV)
    if self.path == "/health":
      self.send_json(200, {"status": "ok"})
    elif self.path == "/":
      self.send_json(200, {
        "service_name": os.environ.get("SERVICE_NAME", "hello-local"),
        "message": os.environ.get("MESSAGE", "Hello locally! How are you?"),
        "image_version": IMAGE_VERSION,
        "app_env": APP_ENV,
        "log_level": LOG_LEVEL.lower(),
      })
    else:
      self.send_json(404, {"error": "not found"})

  def send_json(self, status: int, content: dict[str, str]) -> None:
    """상태 코드와 UTF-8 JSON 응답 전송."""
    body = json.dumps(content).encode()
    self.send_response(status)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)


if __name__ == "__main__":
  ThreadingHTTPServer(("0.0.0.0", 8080), HelloHandler).serve_forever()
