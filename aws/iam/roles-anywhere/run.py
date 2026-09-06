"""Authenticate with an X.509 certificate through IAM Roles Anywhere, then call AgentCore Memory.

  export AWS_PROFILE=...        # NOT used for the client. Only the certificate below authenticates.
  python run.py                 # clients/v1 by default
  RA_CERTIFICATE=... RA_PRIVATE_KEY=... python run.py

How it works: boto3 reads a temporary AWS config whose profile has
  credential_process = aws_signing_helper credential-process --certificate ... --private-key ...
The helper signs a CreateSession request with the leaf private key; Roles Anywhere checks the
chain against the trust anchor, evaluates the Role trust (CN condition), performs AssumeRole
itself and returns temporary keys. boto3 re-runs the helper when they expire. No STS call, no
long-lived AWS key, no ambient credentials: an explicit profile makes boto3 ignore env keys.
"""

import configparser
import json
import os
import shlex
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import uuid4

import boto3
import botocore.session
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

ROOT = Path(__file__).resolve().parent
REGION = "ap-northeast-2"


def lab_config() -> dict:
  lab = json.loads(Path(os.environ.get("LAB_CONFIG", ROOT / "runtime/lab.json")).read_text())
  if lab["region"] != REGION:
    raise ValueError(f"This lab uses {REGION}")
  return lab


def helper_command(lab: dict) -> list[str]:
  """The official helper does the X.509 signing; Python never touches the private key."""
  helper = shutil.which(
    str(os.environ.get("SIGNING_HELPER", ROOT / "runtime/bin/aws_signing_helper"))
  )
  if not helper:
    raise ValueError("Run: python install_helper.py  (or set SIGNING_HELPER)")
  certificate = Path(
    os.environ.get("RA_CERTIFICATE", ROOT / "runtime/pki/clients/v1/client.crt")
  ).resolve(strict=True)
  private_key = Path(
    os.environ.get("RA_PRIVATE_KEY", ROOT / "runtime/pki/clients/v1/client.key")
  ).resolve(strict=True)
  return [
    helper, "credential-process",
    "--certificate", str(certificate),
    "--private-key", str(private_key),
    "--trust-anchor-arn", lab["trust_anchor_arn"],
    "--profile-arn", lab["profile_arn"],
    "--role-arn", lab["role_arn"],
    "--region", REGION,
    "--endpoint", f"https://rolesanywhere.{REGION}.amazonaws.com",
    "--session-duration", "3600",
  ]  # fmt: skip


def certificate_session(command: list[str]):
  """Context manager: a boto3 Session whose only credential source is the helper process."""

  class _Session:
    def __enter__(self) -> boto3.Session:
      self.directory = TemporaryDirectory(prefix="roles-anywhere-")
      path = Path(self.directory.name) / "config"
      profile = configparser.RawConfigParser()
      profile["profile lab-ra"] = {"region": REGION, "credential_process": shlex.join(command)}
      with path.open("x") as output:
        path.chmod(0o600)
        profile.write(output)
      core = botocore.session.Session(profile="lab-ra")
      core.set_config_variable("config_file", str(path))
      core.set_config_variable("credentials_file", str(path.parent / "no-credentials"))
      session = boto3.Session(botocore_session=core)
      credentials = session.get_credentials()
      if credentials is None or credentials.method != "custom-process":
        raise RuntimeError("The credential_process provider was not selected")
      print("CREDENTIAL_PROVIDER_OK custom-process (aws_signing_helper)", flush=True)
      return session

    def __exit__(self, *_: object) -> None:
      self.directory.cleanup()

  return _Session()


def memory_client(session: boto3.Session) -> Any:
  return session.client(
    "bedrock-agentcore",
    region_name=REGION,
    endpoint_url=f"https://bedrock-agentcore.{REGION}.amazonaws.com",
    config=Config(
      signature_version="v4",
      proxies={},
      connect_timeout=10,
      read_timeout=20,
      retries={"mode": "standard", "total_max_attempts": 3},
    ),
  )


def round_trip(memory: Any, memory_id: str) -> None:
  """Write one event, read it back, delete it even if the read fails."""
  identifiers = {"memoryId": memory_id, "actorId": "ra-client", "sessionId": f"probe-{uuid4().hex}"}
  payload = [{"conversational": {"role": "USER", "content": {"text": f"RA probe {uuid4().hex}"}}}]
  event = memory.create_event(
    **identifiers, eventTimestamp=datetime.now(UTC), clientToken=uuid4().hex, payload=payload
  )["event"]
  print("CREATE_EVENT_OK", flush=True)
  request = {**identifiers, "eventId": event["eventId"]}
  try:
    if memory.get_event(**request)["event"].get("payload") != payload:
      raise RuntimeError("The returned event content differs from the written content")
    print("GET_EVENT_OK payload_matches=true", flush=True)
  finally:
    memory.delete_event(**request)
    print("DELETE_EVENT_OK", flush=True)


def main() -> None:
  lab = lab_config()
  with certificate_session(helper_command(lab)) as session:
    identity = session.client("sts", region_name=REGION).get_caller_identity()
    print(f"CALLER_IDENTITY_OK arn={identity['Arn']}", flush=True)
    round_trip(memory_client(session), lab["memory_id"])
  print("PASS certificate -> Roles Anywhere CreateSession -> AgentCore Memory", flush=True)


if __name__ == "__main__":
  try:
    main()
  except (BotoCoreError, ClientError, FileNotFoundError, RuntimeError, ValueError) as error:
    print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)
