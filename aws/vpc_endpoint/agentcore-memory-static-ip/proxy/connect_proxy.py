from __future__ import annotations

import json
import os
import select
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def relay(client: socket.socket, upstream: socket.socket) -> None:
  """Copy opaque bytes bidirectionally, ending on EOF or a five-minute idle period."""
  peers = {client: upstream, upstream: client}
  while True:
    readable, _, _ = select.select(list(peers), [], [], 300)
    if not readable:
      return
    for source in readable:
      data = source.recv(65536)
      if not data:
        return
      peers[source].sendall(data)


class ConnectHandler(BaseHTTPRequestHandler):
  protocol_version = "HTTP/1.1"
  rbufsize = 0

  def do_CONNECT(self) -> None:
    """Allow exact AWS host:443 destinations, mapped to operator-configured VPCE DNS."""
    target = self.server.routes.get(self.path)
    if target is None:
      self.send_error(403, "Destination is not allowed")
      return
    try:
      upstream = socket.create_connection((target, 443), timeout=10)
    except OSError:
      self.send_error(502, "VPC endpoint is unavailable")
      return
    self.close_connection = True
    with upstream:
      self.send_response(200, "Connection established")
      self.end_headers()
      self.wfile.flush()
      self.connection.settimeout(300)
      upstream.settimeout(300)
      try:
        relay(self.connection, upstream)
      except OSError:
        return

  def log_message(self, format: str, *args) -> None:
    """Keep request content and authentication headers out of proxy logs."""


class ConnectServer(ThreadingHTTPServer):
  daemon_threads = True

  def __init__(self, address: tuple, routes: dict[str, str]) -> None:
    """Bind a CONNECT-only server to an explicit allowlist of destinations."""
    self.routes = routes
    super().__init__(address, ConnectHandler)


def main() -> None:
  """Load endpoint routes and serve behind the NLB's TLS listener."""
  routes = json.loads(Path(os.environ["PROXY_ROUTES_FILE"]).read_text())
  with ConnectServer(("0.0.0.0", 8080), routes) as server:
    server.serve_forever()


if __name__ == "__main__":
  main()
