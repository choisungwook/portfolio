"""Lab PKI: a private CA, leaf certificates for Roles Anywhere, revocation and a CRL.

  python pki.py init              # CA + clients/v1 (CN=memory-client) + clients/denied (other CN)
  python pki.py issue v2          # new key + new serial, same CN
  python pki.py revoke v1         # revoke and regenerate runtime/pki/ca/revoked.pem
  python pki.py crl               # regenerate the CRL only

Private keys stay under runtime/pki (git-ignored). Only ca/ca.crt is ever sent to AWS.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PKI = ROOT / "runtime/pki"
COMMON_NAME = "memory-client"
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
  """Run OpenSSL against the lab CA directory; never prints key material."""
  result = subprocess.run(
    ["openssl", *map(str, arguments)],
    check=True,
    capture_output=True,
    text=True,
    env={**os.environ, "LAB_PKI_CA": str(ca.resolve())},
  )
  return result.stdout


def create_ca(root: Path) -> None:
  """Seven-day private CA with an OpenSSL issuance database (index, serial, crlnumber)."""
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
    ca, "req", "-new", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "7",
    "-subj", "/CN=RolesAnywhereLabCA", "-config", ca / "openssl.cnf", "-extensions",
    "ca_extensions", "-keyout", ca / "ca.key", "-out", ca / "ca.crt",
  )  # fmt: skip


def issue_client(root: Path, version: str, common_name: str) -> Path:
  """Two-day leaf certificate with its own key and serial. CN is what the Role trust checks."""
  os.umask(0o077)
  ca = root / "ca"
  destination = root / "clients" / version
  destination.mkdir(parents=True, exist_ok=False)
  openssl(
    ca, "req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256", "-subj", f"/CN={common_name}",
    "-keyout", destination / "client.key", "-out", destination / "client.csr",
  )  # fmt: skip
  openssl(
    ca, "ca", "-batch", "-notext", "-config", ca / "openssl.cnf",
    "-in", destination / "client.csr", "-out", destination / "client.crt",
  )  # fmt: skip
  openssl(ca, "verify", "-CAfile", ca / "ca.crt", destination / "client.crt")
  return destination


def generate_crl(root: Path) -> Path:
  """Complete signed CRL from the issuance database. AWS needs the whole list every time."""
  ca = root / "ca"
  output = ca / "revoked.pem"
  openssl(ca, "ca", "-gencrl", "-config", ca / "openssl.cnf", "-out", output)
  return output


def revoke_client(root: Path, certificate: Path) -> Path:
  """Mark one certificate revoked in the local CA database and regenerate the CRL."""
  ca = root / "ca"
  openssl(ca, "ca", "-config", ca / "openssl.cnf", "-revoke", certificate)
  return generate_crl(root)


def main(argv: list[str] | None = None) -> None:
  parser = argparse.ArgumentParser(
    description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
  )
  sub = parser.add_subparsers(dest="command", required=True)
  sub.add_parser("init")
  sub.add_parser("issue").add_argument("version")
  sub.add_parser("revoke").add_argument("version")
  sub.add_parser("crl")
  args = parser.parse_args(argv)
  if args.command == "init":
    create_ca(PKI)
    issue_client(PKI, "v1", COMMON_NAME)
    issue_client(PKI, "denied", "other-client")
    print(f"PKI_READY {PKI}  (ca/ca.crt -> trust anchor, clients/v1 -> client, clients/denied)")
  elif args.command == "issue":
    print(f"ISSUED {issue_client(PKI, args.version, COMMON_NAME)}  (same CN, new key and serial)")
  elif args.command == "revoke":
    crl = revoke_client(PKI, PKI / "clients" / args.version / "client.crt")
    print(f"CRL_READY {crl}  (local only; upload with: python crl_aws.py import|update)")
  elif args.command == "crl":
    print(f"CRL_READY {generate_crl(PKI)}")


if __name__ == "__main__":
  try:
    main()
  except (FileExistsError, FileNotFoundError, subprocess.CalledProcessError) as error:
    print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)
