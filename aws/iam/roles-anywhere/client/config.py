import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGION = "ap-northeast-2"


def lab_config() -> dict:
  """Read this lab's non-secret Terraform output and require the Seoul region."""
  path = Path(os.environ.get("LAB_CONFIG", ROOT / "runtime/lab.json"))
  lab = json.loads(path.read_text())
  if lab["region"] != REGION:
    raise ValueError("This lab uses ap-northeast-2")
  return lab


def certificate_path() -> Path:
  """Find the selected leaf certificate, defaulting to the first lab certificate."""
  return Path(os.environ.get("RA_CERTIFICATE", ROOT / "runtime/pki/clients/v1/client.crt")).resolve(
    strict=True
  )


def private_key_path() -> Path:
  """Find the selected leaf private key without reading its contents in Python."""
  return Path(os.environ.get("RA_PRIVATE_KEY", ROOT / "runtime/pki/clients/v1/client.key")).resolve(
    strict=True
  )
