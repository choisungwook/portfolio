import http.client
import socket
import ssl
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import boto3
import pytest
from botocore.config import Config

from proxy.connect_proxy import ConnectServer
from scenarios.s05_nlb_endpoint_only import expect_hostname_mismatch
from scenarios.s07_public_proxy_sts import proxy_config, service_client

AWS_HOST = "rolesanywhere.ap-northeast-2.amazonaws.com"
MEMORY_HOST = "bedrock-agentcore.ap-northeast-2.amazonaws.com"
PROXY_HOST = "proxy.test.invalid"


@pytest.fixture
def tls_material(tmp_path):
  config = tmp_path / "server.cnf"
  config.write_text(
    f"[req]\ndistinguished_name=dn\n[dn]\n[v3]\n"
    f"subjectAltName=DNS:{AWS_HOST},DNS:{MEMORY_HOST},DNS:{PROXY_HOST}\n"
    "basicConstraints=critical,CA:TRUE\n"
  )
  key, cert = tmp_path / "key.pem", tmp_path / "cert.pem"
  subprocess.run(
    [
      "openssl",
      "req",
      "-new",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      f"/CN={AWS_HOST}",
      "-config",
      str(config),
      "-extensions",
      "v3",
      "-keyout",
      str(key),
      "-out",
      str(cert),
    ],
    check=True,
    capture_output=True,
  )
  return key, cert


@pytest.fixture
def aws_origin(tls_material):
  key, cert = tls_material
  captured = {}

  class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
      captured["host"] = self.headers["Host"]
      captured["authorization"] = self.headers["Authorization"]
      if self.headers["X-Amz-Security-Token"]:
        captured["token"] = self.headers["X-Amz-Security-Token"]
      self.send_response(200)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      body = b'{"event":{"eventId":"returned-event"}}'
      self.wfile.write(body if self.path.startswith("/memories/") else b"encrypted AWS response")

    def log_message(self, *args):
      pass

  server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
  context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
  context.load_cert_chain(cert, key)
  context.set_servername_callback(lambda connection, name, ctx: captured.update(sni=name))
  server.socket = context.wrap_socket(server.socket, server_side=True)
  thread = threading.Thread(target=server.serve_forever, daemon=True)
  thread.start()
  yield server, cert, captured
  server.shutdown()
  server.server_close()
  thread.join()


@pytest.fixture
def connect_proxy(aws_origin, monkeypatch):
  origin, _, _ = aws_origin
  original_connect = socket.create_connection

  def connect(address, *args, **kwargs):
    if address == ("vpce.test.invalid", 443):
      return original_connect(origin.server_address, *args, **kwargs)
    return original_connect(address, *args, **kwargs)

  monkeypatch.setattr(socket, "create_connection", connect)
  proxy = ConnectServer(("127.0.0.1", 0), {f"{AWS_HOST}:443": "vpce.test.invalid"})
  thread = threading.Thread(target=proxy.serve_forever, daemon=True)
  thread.start()
  yield proxy
  proxy.shutdown()
  proxy.server_close()
  thread.join()


def test_connect_tunnel_preserves_verified_tls_sni_host_and_authorization(
  connect_proxy, aws_origin
):
  _, cert, captured = aws_origin
  context = ssl.create_default_context(cafile=str(cert))
  connection = http.client.HTTPSConnection(*connect_proxy.server_address, context=context)
  connection.set_tunnel(AWS_HOST, 443)
  connection.request("GET", "/sessions", headers={"Authorization": "opaque-X509-signature"})
  response = connection.getresponse()
  assert response.status == 200
  assert response.read() == b"encrypted AWS response"
  connection.close()
  assert captured == {
    "host": AWS_HOST,
    "sni": AWS_HOST,
    "authorization": "opaque-X509-signature",
  }


@pytest.mark.parametrize(
  "target",
  [
    "example.com:443",
    "169.254.169.254:80",
    f"{AWS_HOST}:80",
    f"{AWS_HOST}.evil.test:443",
  ],
)
def test_proxy_rejects_non_allowlisted_destinations(connect_proxy, target):
  connection = http.client.HTTPConnection(*connect_proxy.server_address)
  connection.request("CONNECT", target)
  assert connection.getresponse().status == 403
  connection.close()


def test_changing_only_nlb_hostname_fails_before_authentication(aws_origin, monkeypatch):
  origin, cert, captured = aws_origin
  context = ssl.create_default_context(cafile=str(cert))
  monkeypatch.setattr(ssl, "create_default_context", lambda: context)
  expect_hostname_mismatch(f"https://localhost:{origin.server_port}")
  assert captured.get("sni") == "localhost"
  assert "authorization" not in captured


def test_boto3_tunnels_sigv4_through_verified_https_proxy(
  connect_proxy, aws_origin, tls_material, monkeypatch
):
  _, cert, captured = aws_origin
  key, _ = tls_material
  original_resolve = socket.getaddrinfo

  def resolve(host, *args, **kwargs):
    return original_resolve("127.0.0.1" if host == PROXY_HOST else host, *args, **kwargs)

  monkeypatch.setattr(socket, "getaddrinfo", resolve)
  monkeypatch.setenv("AWS_CA_BUNDLE", str(cert))
  proxy = ConnectServer(("127.0.0.1", 0), {f"{MEMORY_HOST}:443": "vpce.test.invalid"})
  outer_tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
  outer_tls.load_cert_chain(cert, key)
  proxy.socket = outer_tls.wrap_socket(proxy.socket, server_side=True)
  thread = threading.Thread(target=proxy.serve_forever, daemon=True)
  thread.start()
  session = boto3.Session(
    aws_access_key_id="ASIAEXAMPLELOCALTEST",
    aws_secret_access_key="fake-local-secret",
    aws_session_token="fake-local-token",
  )
  config = proxy_config(f"https://{PROXY_HOST}:{proxy.server_port}").merge(
    Config(proxies_config={"proxy_ca_bundle": str(cert), "proxy_use_forwarding_for_https": False})
  )
  memory = service_client(session, "bedrock-agentcore", f"https://{MEMORY_HOST}", config)
  try:
    result = memory.get_event(
      memoryId="test_memory-1234567890",
      actorId="actor",
      sessionId="session",
      eventId="0000000001#12345678-1234-1234-1234-123456789012",
    )
    assert result["event"]["eventId"] == "returned-event"
    assert captured["host"] == captured["sni"] == MEMORY_HOST
    assert "/ap-northeast-2/bedrock-agentcore/aws4_request" in captured["authorization"]
    assert captured["token"] == "fake-local-token"
  finally:
    memory.close()
    proxy.shutdown()
    proxy.server_close()
    thread.join()
