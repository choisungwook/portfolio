"""S01: call STS and AgentCore Memory through public NLB EIPs with /etc/hosts overrides.

Self-contained on purpose: every check this scenario relies on is in this file.
"""

import argparse
import json
import os
import socket
import ssl
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from ipaddress import IPv4Address
from pathlib import Path
from typing import Any
from uuid import uuid4

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

REGION = "ap-northeast-2"
DEFAULT_CONFIG = Path(__file__).resolve().parents[1] / "runtime/config.json"


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
  sts_ip: str
  memory_ip: str

  @property
  def hosts(self) -> dict[str, str]:
    """AWS hostnames and the NLB EIP each one must resolve to."""
    return {
      f"sts.{self.region}.amazonaws.com": self.sts_ip,
      f"bedrock-agentcore.{self.region}.amazonaws.com": self.memory_ip,
    }


def choose_addresses(config: dict, az: str | None) -> dict[str, str]:
  """Select one deployed AZ and validate the two public NLB addresses."""
  zones = sorted(config["services"]["sts"]["eips"])
  if not zones:
    raise ValueError("No deployed NLB AZs found")
  selected = az or zones[0]
  if selected not in zones:
    raise ValueError(f"Choose a deployed AZ: {', '.join(zones)}")
  return {
    name: str(IPv4Address(config["services"][name]["eips"][selected])) for name in ("sts", "memory")
  }


def load_config(path: Path, az: str | None = None) -> Config:
  """Read non-secret Terraform output and pin one AZ for this run."""
  config = json.loads(path.read_text())
  if config["region"] != REGION:
    raise ValueError(f"The lab region must be {REGION}")
  addresses = choose_addresses(config, az)
  return Config(
    region=config["region"],
    role_arn=config["role_arn"],
    memory_id=config["memory_id"],
    sts_ip=addresses["sts"],
    memory_ip=addresses["memory"],
  )


# ---------------------------------------------------------------- network checks


def verify_dns(hostname: str, expected_ip: str) -> None:
  """Reject public DNS fallback or any unexpected IPv4/IPv6 destination."""
  addresses = {
    str(record[4][0]) for record in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
  }
  if addresses != {expected_ip}:
    raise RuntimeError(f"DNS mismatch for {hostname}: {addresses}; expected {expected_ip}")
  print(f"DNS_OK {hostname} -> {expected_ip}", flush=True)


def verify_tls(hostname: str, expected_ip: str) -> None:
  """Connect to the EIP and validate the AWS certificate with the original SNI."""
  context = ssl.create_default_context()
  with (
    socket.create_connection((hostname, 443), timeout=10) as connection,
    context.wrap_socket(connection, server_hostname=hostname) as secure,
  ):
    peer_ip = secure.getpeername()[0]
    if peer_ip != expected_ip:
      raise RuntimeError(f"Unexpected TLS peer: {peer_ip}")
    print(f"TLS_OK {hostname} peer={peer_ip} version={secure.version()}", flush=True)


# ---------------------------------------------------------------- AWS calls


def initial_session(region: str) -> boto3.Session:
  """Start from the named local AWS profile. An explicit profile makes boto3 ignore env keys."""
  return boto3.Session(profile_name=required_env("AWS_PROFILE"), region_name=region)


def api_client(session: boto3.Session, service: str, region: str) -> Any:
  """SigV4 client pinned to the Seoul regional URL, no proxy, no global STS."""
  return session.client(
    service,
    region_name=region,
    endpoint_url=f"https://{service}.{region}.amazonaws.com",
    config=BotoConfig(
      signature_version="v4",
      connect_timeout=10,
      read_timeout=20,
      retries={"mode": "standard", "total_max_attempts": 3},
      proxies={},
      use_dualstack_endpoint=False,
      use_fips_endpoint=False,
    ),
  )


def assume_session(sts: Any, config: Config) -> boto3.Session:
  """Exchange the profile identity for a 15-minute lab role session."""
  response = sts.assume_role(
    RoleArn=config.role_arn,
    RoleSessionName=f"static-ip-{uuid4().hex[:12]}",
    DurationSeconds=900,
  )
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
  text = f"NLB static IP probe {uuid4().hex}"
  event = memory.create_event(
    **identifiers,
    eventTimestamp=datetime.now(UTC),
    clientToken=uuid4().hex,
    payload=event_payload(text),
  )["event"]
  print(f"CREATE_EVENT_OK event_id={event['eventId']}", flush=True)
  return {"event_id": event["eventId"], "payload": event_payload(text)}


def memory_round_trip(memory: Any, memory_id: str) -> None:
  """Write/read one event, verify its content, and delete it even on a read failure."""
  identifiers = {
    "memoryId": memory_id,
    "actorId": "static-ip-client",
    "sessionId": f"probe-{uuid4().hex}",
  }
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


# ---------------------------------------------------------------- entry point


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
  parser.add_argument("--az")
  args = parser.parse_args()
  config = load_config(args.config, args.az)
  for hostname, expected_ip in config.hosts.items():
    verify_dns(hostname, expected_ip)
    verify_tls(hostname, expected_ip)
  source = initial_session(config.region)
  session = assume_session(api_client(source, "sts", config.region), config)
  identity = api_client(session, "sts", config.region).get_caller_identity()
  print(f"CALLER_IDENTITY_OK arn={identity['Arn']}", flush=True)
  memory_round_trip(api_client(session, "bedrock-agentcore", config.region), config.memory_id)
  print("PASS STS AssumeRole -> AgentCore Memory through NLB EIPs", flush=True)


if __name__ == "__main__":
  try:
    main()
  except (BotoCoreError, ClientError, KeyError, OSError, RuntimeError, ValueError) as error:
    print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)
