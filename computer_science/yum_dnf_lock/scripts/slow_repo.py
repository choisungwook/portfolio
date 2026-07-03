import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class SlowRepoHandler(BaseHTTPRequestHandler):
  def do_GET(self):
    delay_seconds = int(os.environ.get("SLOW_REPO_DELAY_SECONDS", "120"))
    print(f"slow response for {self.path}: {delay_seconds}s", flush=True)
    time.sleep(delay_seconds)
    self.send_response(404)
    self.end_headers()
    self.wfile.write(b"not found\n")

  def log_message(self, format, *args):
    print(format % args, flush=True)


def main():
  server = ThreadingHTTPServer(("127.0.0.1", 8080), SlowRepoHandler)
  server.serve_forever()


if __name__ == "__main__":
  main()
