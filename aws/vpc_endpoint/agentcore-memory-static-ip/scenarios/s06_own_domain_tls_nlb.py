"""S06: call STS and AgentCore Memory with the SDK pointed at own-domain TLS NLB names.

The TLS NLB terminates our ACM certificate and re-encrypts to the endpoint ENIs, so TLS
succeeds on the client. The open question is whether AWS accepts a request whose SNI is
absent and whose Host header (and SigV4 host) is our domain. Self-contained on purpose.
"""

import argparse
import json
import os
import socket
import ssl
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

REGION = "ap-northeast-2"
DEFAULT_CONFIG = Path(__file__).resolve().parents[1] / "runtime/config.json"
REJECTED_EXIT_CODE = 2


class OwnHostRejected(Exception):
  """AWS answered the request but refused the own-domain Host/SNI combination."""

  def __init__(self, stage: str, error: ClientError):
    detail = error.response.get("Error", {})
    self.stage = stage
    self.code = detail.get("Code", "Unknown")
    self.message = detail.get("Message", str(error))
    super().__init__(f"{stage} rejected with {self.code}: {self.message}")


def required_env(name: str) -> str:
  """Return a required environment value, or fail before making network calls."""
  value = os.environ.get(name, "").strip()
  if not value:
    raise ValueError(f"Missing environment variable: {name}")
  return value


# ---------------------------------------------------------------- runtime config


@dataclass(frozen=True)
class Config:
  region: str
  role_arn: str
  memory_id: str
  sts_url: str
  memory_url: str

  @property
  def urls(self) -> dict[str, str]:
    """boto3 service name -> own-domain endpoint URL."""
    return {"sts": self.sts_url, "bedrock-agentcore": self.memory_url}


def own_domain_url(config: dict, service: str) -> str:
  """Read the S06 URL of one service, or explain that S06 is not deployed."""
  url = config["services"][service].get("own_domain_url")
  if not url:
    raise ValueError(
      f"services.{service}.own_domain_url is empty; apply with acm_certificate_arn and "
      "tls_alias_domains, then regenerate runtime/config.json"
    )
  parsed = urlsplit(url)
  if parsed.scheme != "https" or not parsed.hostname or parsed.port not in (None, 443):
    raise ValueError(f"Expected an https URL on port 443 for {service}: {url}")
  return url


def load_config(path: Path) -> Config:
  """Read non-secret Terraform output and keep only what S06 needs."""
  config = json.loads(path.read_text())
  if config["region"] != REGION:
    raise ValueError(f"The lab region must be {REGION}")
  return Config(
    region=config["region"],
    role_arn=config["role_arn"],
    memory_id=config["memory_id"],
    sts_url=own_domain_url(config, "sts"),
    memory_url=own_domain_url(config, "memory"),
  )


# ---------------------------------------------------------------- network checks


def verify_own_certificate(url: str) -> None:
  """The TLS NLB must present a certificate that carries our own-domain name."""
  hostname = urlsplit(url).hostname
  with (
    socket.create_connection((hostname, 443), timeout=10) as connection,
    ssl.create_default_context().wrap_socket(connection, server_hostname=hostname) as secure,
  ):
    issuer = dict(item for pair in secure.getpeercert()["issuer"] for item in pair)
    print(
      f"TLS_OK {hostname} peer={secure.getpeername()[0]} issuer={issuer.get('organizationName')}",
      flush=True,
    )


# ---------------------------------------------------------------- AWS calls


def print_host_header(request: Any, **_: Any) -> None:
  """Show the Host header that reaches AWS; SigV4 signed exactly this value."""
  print(f"REQUEST host={request.headers.get('Host')} url={request.url}", flush=True)


def initial_session(region: str) -> boto3.Session:
  """Start from the named local AWS profile. An explicit profile makes boto3 ignore env keys."""
  return boto3.Session(profile_name=required_env("AWS_PROFILE"), region_name=region)


def api_client(session: boto3.Session, service: str, url: str, region: str) -> Any:
  """SigV4 client whose URL, SNI, Host and signed host are all the own-domain name."""
  client = session.client(
    service,
    region_name=region,
    endpoint_url=url,
    config=BotoConfig(
      signature_version="v4",
      connect_timeout=10,
      read_timeout=20,
      retries={"mode": "standard", "total_max_attempts": 2},
      proxies={},
      use_dualstack_endpoint=False,
      use_fips_endpoint=False,
    ),
  )
  client.meta.events.register("before-send.*.*", print_host_header)
  return client


def assume_session(sts: Any, config: Config) -> boto3.Session:
  """Exchange the profile identity for a 15-minute lab role session via the own domain."""
  try:
    response = sts.assume_role(
      RoleArn=config.role_arn,
      RoleSessionName=f"own-domain-{uuid4().hex[:12]}",
      DurationSeconds=900,
    )
  except ClientError as error:
    raise OwnHostRejected("STS AssumeRole", error) from error
  credentials = response["Credentials"]
  print(f"ASSUME_ROLE_OK expires={credentials['Expiration'].isoformat()}", flush=True)
  return boto3.Session(
    aws_access_key_id=credentials["AccessKeyId"],
    aws_secret_access_key=credentials["SecretAccessKey"],
    aws_session_token=credentials["SessionToken"],
    region_name=config.region,
  )


def event_payload(text: str) -> list[dict]:
  """One short-term conversational event payload."""
  return [{"conversational": {"role": "USER", "content": {"text": text}}}]


def create_probe_event(memory: Any, identifiers: dict) -> dict:
  """Write a unique event and return its ID plus the expected content."""
  text = f"own-domain TLS NLB probe {uuid4().hex}"
  event = memory.create_event(
    **identifiers,
    eventTimestamp=datetime.now(UTC),
    clientToken=uuid4().hex,
    payload=event_payload(text),
  )["event"]
  print(f"CREATE_EVENT_OK event_id={event['eventId']}", flush=True)
  return {"event_id": event["eventId"], "payload": event_payload(text)}


def memory_round_trip(memory: Any, memory_id: str) -> None:
  """Write/read one event, verify its content, and delete it even on a read failure.

  Any AWS error response (Create, Get or Delete) is a REJECTED verdict, not a FAIL.
  """
  identifiers = {
    "memoryId": memory_id,
    "actorId": "static-ip-client",
    "sessionId": f"probe-{uuid4().hex}",
  }
  try:
    probe = create_probe_event(memory, identifiers)
    request = {**identifiers, "eventId": probe["event_id"]}
    try:
      received = memory.get_event(**request)["event"]
      if received.get("payload") != probe["payload"]:
        raise RuntimeError("Memory content did not match the submitted payload")
      print("GET_EVENT_OK payload_matches=true", flush=True)
    finally:
      memory.delete_event(**request)
      print("DELETE_EVENT_OK", flush=True)
  except ClientError as error:
    raise OwnHostRejected(f"Memory {error.operation_name}", error) from error


def caller_identity(sts: Any) -> str:
  """GetCallerIdentity with the role session, still through the own domain."""
  try:
    return sts.get_caller_identity()["Arn"]
  except ClientError as error:
    raise OwnHostRejected("STS GetCallerIdentity", error) from error


# ---------------------------------------------------------------- entry point


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
  args = parser.parse_args()
  config = load_config(args.config)
  for url in config.urls.values():
    verify_own_certificate(url)
  source = initial_session(config.region)
  session = assume_session(api_client(source, "sts", config.sts_url, config.region), config)
  arn = caller_identity(api_client(session, "sts", config.sts_url, config.region))
  print(f"CALLER_IDENTITY_OK arn={arn}", flush=True)
  memory = api_client(session, "bedrock-agentcore", config.memory_url, config.region)
  memory_round_trip(memory, config.memory_id)
  print("PASS own-domain TLS NLB -> STS / AgentCore Memory with own Host header", flush=True)


if __name__ == "__main__":
  try:
    main()
  except OwnHostRejected as rejected:
    print(f"REJECTED stage={rejected.stage} code={rejected.code} message={rejected.message}")
    sys.exit(REJECTED_EXIT_CODE)
  except (BotoCoreError, ClientError, KeyError, OSError, RuntimeError, ValueError) as error:
    print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)
