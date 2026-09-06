import os
import subprocess
from pathlib import Path

from client.config import ROOT

PKI = ROOT / "runtime/pki"
CA_CONFIG = """
[ca]
default_ca = lab
[lab]
dir = $ENV::LAB_PKI_CA
database = $dir/index.txt
new_certs_dir = $dir/newcerts
certificate = $dir/ca.crt
private_key = $dir/ca.key
serial = $dir/serial
crlnumber = $dir/crlnumber
default_md = sha256
default_days = 2
default_crl_days = 2
policy = subject_policy
x509_extensions = leaf
unique_subject = no
[subject_policy]
commonName = supplied
[req]
distinguished_name = dn
[dn]
[ca_extensions]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
[leaf]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
"""


def openssl(ca: Path, *arguments: str | Path) -> str:
  """Run OpenSSL using the selected lab CA directory without logging private material."""
  result = subprocess.run(
    ["openssl", *map(str, arguments)],
    check=True,
    capture_output=True,
    text=True,
    env={**os.environ, "LAB_PKI_CA": str(ca.resolve())},
  )
  return result.stdout


def create_ca(root: Path) -> None:
  """Create a fresh seven-day lab CA and its certificate issuance database."""
  os.umask(0o077)
  root.mkdir(parents=True, exist_ok=False)
  ca = root / "ca"
  (ca / "newcerts").mkdir(parents=True)
  (ca / "openssl.cnf").write_text(CA_CONFIG)
  for name, value in {
    "index.txt": "",
    "index.txt.attr": "unique_subject = no\n",
    "serial": "1000\n",
    "crlnumber": "1000\n",
  }.items():
    (ca / name).write_text(value)
  openssl(
    ca,
    "req",
    "-new",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "7",
    "-subj",
    "/CN=RolesAnywhereLabCA",
    "-config",
    ca / "openssl.cnf",
    "-extensions",
    "ca_extensions",
    "-keyout",
    ca / "ca.key",
    "-out",
    ca / "ca.crt",
  )


def issue_client(root: Path, version: str, common_name: str) -> Path:
  """Issue a new two-day leaf certificate with a distinct key and serial number."""
  os.umask(0o077)
  ca = root / "ca"
  destination = root / "clients" / version
  destination.mkdir(parents=True, exist_ok=False)
  openssl(
    ca,
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-subj",
    f"/CN={common_name}",
    "-keyout",
    destination / "client.key",
    "-out",
    destination / "client.csr",
  )
  openssl(
    ca,
    "ca",
    "-batch",
    "-notext",
    "-config",
    ca / "openssl.cnf",
    "-in",
    destination / "client.csr",
    "-out",
    destination / "client.crt",
  )
  openssl(ca, "verify", "-CAfile", ca / "ca.crt", destination / "client.crt")
  return destination


def revoke_client(root: Path, certificate: Path) -> Path:
  """Revoke one lab certificate and generate a signed PEM CRL for upload."""
  ca = root / "ca"
  openssl(ca, "ca", "-config", ca / "openssl.cnf", "-revoke", certificate)
  return generate_crl(root)


def generate_crl(root: Path) -> Path:
  """Generate a fresh complete CRL from the lab CA's revocation database."""
  ca = root / "ca"
  output = ca / "revoked.pem"
  openssl(ca, "ca", "-gencrl", "-config", ca / "openssl.cnf", "-out", output)
  return output
