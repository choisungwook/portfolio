"""S05: prove that pointing the SDK at an own-domain NLB name fails TLS before any request.

Self-contained: the only check is a TLS handshake with the own-domain SNI.
"""

import os
import socket
import ssl
import sys
from urllib.parse import urlsplit

HOSTNAME_MISMATCH = 62  # OpenSSL X509_V_ERR_HOSTNAME_MISMATCH


def required_env(name: str) -> str:
  value = os.environ.get(name, "").strip()
  if not value:
    raise ValueError(f"Missing environment variable: {name}")
  return value


def expect_hostname_mismatch(url: str) -> None:
  """Count only a certificate hostname mismatch as the negative experiment result."""
  parsed = urlsplit(url)
  if parsed.scheme != "https" or not parsed.hostname:
    raise ValueError("Provide the HTTPS URL of an own-domain name that resolves to the TCP NLB")
  try:
    with (
      socket.create_connection((parsed.hostname, parsed.port or 443), timeout=10) as raw,
      ssl.create_default_context().wrap_socket(raw, server_hostname=parsed.hostname),
    ):
      pass
  except ssl.SSLCertVerificationError as error:
    if error.verify_code != HOSTNAME_MISMATCH:
      raise RuntimeError(
        "Inconclusive: certificate failed for a reason other than hostname"
      ) from error
    print("EXPECTED_FAILURE TLS hostname mismatch; no credentials were sent")
    return
  raise RuntimeError("Unexpected TLS success: this is not the assumed passthrough NLB setup")


if __name__ == "__main__":
  try:
    expect_hostname_mismatch(required_env("NLB_ENDPOINT_URL"))
  except (OSError, RuntimeError, ValueError) as error:
    print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)
