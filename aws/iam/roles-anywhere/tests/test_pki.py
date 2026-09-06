import subprocess

import pytest

from scripts.pki import create_ca, issue_client, openssl, revoke_client


def test_leaf_rotation_and_crl_keep_new_key_valid(tmp_path):
  root = tmp_path / "PKI with spaces"
  create_ca(root)
  first = issue_client(root, "v1", "memory-client")
  second = issue_client(root, "v2", "memory-client")
  denied = issue_client(root, "denied", "other-client")
  ca = root / "ca"
  serials = [
    openssl(ca, "x509", "-in", p / "client.crt", "-noout", "-serial") for p in (first, second)
  ]
  assert serials[0] != serials[1]
  assert (first / "client.key").read_bytes() != (second / "client.key").read_bytes()
  assert "other-client" in openssl(ca, "x509", "-in", denied / "client.crt", "-noout", "-subject")
  assert (first / "client.key").stat().st_mode & 0o777 == 0o600
  crl = revoke_client(root, first / "client.crt")
  with pytest.raises(subprocess.CalledProcessError) as error:
    openssl(
      ca, "verify", "-crl_check", "-CAfile", ca / "ca.crt", "-CRLfile", crl, first / "client.crt"
    )
  assert "certificate revoked" in error.value.stderr
  assert "OK" in openssl(
    ca, "verify", "-crl_check", "-CAfile", ca / "ca.crt", "-CRLfile", crl, second / "client.crt"
  )


def test_existing_ca_is_not_overwritten(tmp_path):
  root = tmp_path / "pki"
  create_ca(root)
  original = (root / "ca/ca.crt").read_bytes()
  with pytest.raises(FileExistsError):
    create_ca(root)
  assert (root / "ca/ca.crt").read_bytes() == original
