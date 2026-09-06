import socket

import pytest

from scenarios.s02_client_proxy_sts import proxy_config, verify_local_dns_untouched


def record(address):
  return (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443))


def test_proxy_config_uses_connect_tunnel_not_forwarding():
  config = proxy_config("http://localhost:3128")
  assert config.proxies == {"https": "http://localhost:3128"}
  assert config.proxies_config["proxy_use_forwarding_for_https"] is False
  with pytest.raises(ValueError):
    proxy_config("socks5://localhost:1080")


def test_local_hosts_override_is_rejected(monkeypatch):
  eips = {"sts.ap-northeast-2.amazonaws.com": {"192.0.2.1"}}
  monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [record("192.0.2.1")])
  with pytest.raises(RuntimeError, match="hosts override"):
    verify_local_dns_untouched(eips)
  monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [record("54.1.2.3")])
  verify_local_dns_untouched(eips)
