"""S02: call STS and AgentCore Memory through a client-side CONNECT proxy (Squid).

The app keeps AWS URLs, SNI, Host and SigV4 untouched and only points its AWS clients at
the proxy (LAB_PROXY_URL). A global HTTPS_PROXY would also drag the credential chain
(aws login refresh, credential_process) through the proxy, and those hosts are not in the
Squid allowlist; in production either allowlist them or keep credentials out of the proxy path.
The proxy host resolves the AWS names to the public NLB EIPs; this machine's DNS stays
untouched, and the script checks that. AWS side is the S01 deployment.
Self-contained on purpose.
"""

import argparse
import json
import os
import socket
import sys
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
HOSTNAMES = (f"sts.{REGION}.amazonaws.com", f"bedrock-agentcore.{REGION}.amazonaws.com")


def required_env(name: str) -> str:
  value = os.environ.get(name, "").strip()
  if not value:
    raise ValueError(f"Missing environment variable: {name}")
  return value


def load_config(path: Path) -> dict:
  """Read non-secret Terraform output: role ARN, memory ID and the NLB EIPs."""
  config = json.loads(path.read_text())
  if config["region"] != REGION:
    raise ValueError(f"The lab region must be {REGION}")
  eips = {
    name: set(config["services"][key]["eips"].values())
    for name, key in zip(HOSTNAMES, ("sts", "memory"), strict=True)
  }
  return {"role_arn": config["role_arn"], "memory_id": config["memory_id"], "eips": eips}


def verify_local_dns_untouched(eips: dict[str, set[str]]) -> None:
  """This machine must still resolve AWS names publicly; only the proxy host maps them."""
  for hostname, nlb_ips in eips.items():
    answers = {r[4][0] for r in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)}
    if answers & nlb_ips:
      raise RuntimeError(f"{hostname} resolves to an NLB EIP locally; remove the hosts override")
    print(f"LOCAL_DNS_UNTOUCHED {hostname} -> {sorted(answers)[:2]}...", flush=True)


def proxy_config(url: str) -> BotoConfig:
  """CONNECT tunnel through the proxy; forwarding mode off so AWS TLS stays end to end."""
  if urlsplit(url).scheme not in ("http", "https"):
    raise ValueError("LAB_PROXY_URL must be an http:// or https:// URL")
  return BotoConfig(
    region_name=REGION,
    signature_version="v4",
    proxies={"https": url},
    proxies_config={"proxy_use_forwarding_for_https": False},
    connect_timeout=10,
    read_timeout=20,
    retries={"mode": "standard", "total_max_attempts": 3},
  )


def api_client(session: boto3.Session, service: str, config: BotoConfig) -> Any:
  """AWS regional URL as-is. No endpoint_url tricks; the proxy does the IP mapping."""
  return session.client(service, region_name=REGION, config=config)


def assume_session(sts: Any, role_arn: str) -> boto3.Session:
  creds = sts.assume_role(
    RoleArn=role_arn, RoleSessionName=f"client-proxy-{uuid4().hex[:12]}", DurationSeconds=900
  )["Credentials"]
  print(f"ASSUME_ROLE_OK expires={creds['Expiration'].isoformat()}", flush=True)
  return boto3.Session(
    aws_access_key_id=creds["AccessKeyId"],
    aws_secret_access_key=creds["SecretAccessKey"],
    aws_session_token=creds["SessionToken"],
    region_name=REGION,
  )


def event_payload(text: str) -> list[dict]:
  return [{"conversational": {"role": "USER", "content": {"text": text}}}]


def memory_round_trip(memory: Any, memory_id: str) -> None:
  identifiers = {
    "memoryId": memory_id,
    "actorId": "client-proxy",
    "sessionId": f"probe-{uuid4().hex}",
  }
  text = f"client proxy probe {uuid4().hex}"
  event = memory.create_event(
    **identifiers,
    eventTimestamp=datetime.now(UTC),
    clientToken=uuid4().hex,
    payload=event_payload(text),
  )["event"]
  print(f"CREATE_EVENT_OK event_id={event['eventId']}", flush=True)
  request = {**identifiers, "eventId": event["eventId"]}
  try:
    received = memory.get_event(**request)["event"]
    if received.get("payload") != event_payload(text):
      raise RuntimeError("Memory content did not match the submitted payload")
    print("GET_EVENT_OK payload_matches=true", flush=True)
  finally:
    memory.delete_event(**request)
    print("DELETE_EVENT_OK", flush=True)


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
  args = parser.parse_args()
  lab = load_config(args.config)
  verify_local_dns_untouched(lab["eips"])
  config = proxy_config(required_env("LAB_PROXY_URL"))
  print(f"PROXY_OK {config.proxies['https']}", flush=True)
  source = boto3.Session(profile_name=required_env("AWS_PROFILE"), region_name=REGION)
  session = assume_session(api_client(source, "sts", config), lab["role_arn"])
  identity = api_client(session, "sts", config).get_caller_identity()
  print(f"CALLER_IDENTITY_OK arn={identity['Arn']}", flush=True)
  memory_round_trip(api_client(session, "bedrock-agentcore", config), lab["memory_id"])
  print("PASS client-side CONNECT proxy -> NLB EIPs -> STS / AgentCore Memory", flush=True)


if __name__ == "__main__":
  try:
    main()
  except (BotoCoreError, ClientError, KeyError, OSError, RuntimeError, ValueError) as error:
    print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)
