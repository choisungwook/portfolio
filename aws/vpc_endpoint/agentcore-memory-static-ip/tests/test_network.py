import socket
from unittest.mock import MagicMock

import pytest

from scenarios.s01_public_dns_sts import verify_dns, verify_tls


def record(family, address):
  return (family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443))


@pytest.mark.parametrize(
  "addresses",
  [
    [record(socket.AF_INET, "54.1.2.3")],
    [record(socket.AF_INET, "192.0.2.1"), record(socket.AF_INET6, "2001:db8::1")],
  ],
)
def test_dns_rejects_public_fallback_and_ipv6(monkeypatch, addresses):
  monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: addresses)
  with pytest.raises(RuntimeError, match="DNS mismatch"):
    verify_dns("sts.ap-northeast-2.amazonaws.com", "192.0.2.1")


def test_dns_accepts_only_expected_destination(monkeypatch):
  monkeypatch.setattr(
    socket, "getaddrinfo", lambda *args, **kwargs: [record(socket.AF_INET, "192.0.2.1")]
  )
  verify_dns("sts.ap-northeast-2.amazonaws.com", "192.0.2.1")


def test_tls_uses_original_sni_and_checks_peer(monkeypatch):
  hostname = "sts.ap-northeast-2.amazonaws.com"
  connection = MagicMock()
  secure = MagicMock()
  secure.getpeername.return_value = ("192.0.2.1", 443)
  context = MagicMock()
  context.wrap_socket.return_value.__enter__.return_value = secure
  connect = MagicMock()
  connect.return_value.__enter__.return_value = connection
  monkeypatch.setattr(socket, "create_connection", connect)
  monkeypatch.setattr("ssl.create_default_context", lambda: context)
  verify_tls(hostname, "192.0.2.1")
  context.wrap_socket.assert_called_once_with(connection, server_hostname=hostname)
  secure.getpeername.return_value = ("54.1.2.3", 443)
  with pytest.raises(RuntimeError, match="Unexpected TLS peer"):
    verify_tls(hostname, "192.0.2.1")
