"""S07: tunnel STS and Memory through one public TLS NLB + CONNECT proxy, no DNS override.

Self-contained: profile session, proxy-aware clients and the Memory round trip live here.
"""

import json
import os
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


def required_env(name: str) -> str:
  value = os.environ.get(name, "").strip()
  if not value:
    raise ValueError(f"Missing environment variable: {name}")
  return value


def load_lab() -> dict:
  """Terraform output of labs/s07 exported as a plain JSON object (LAB_CONFIG)."""
  lab = json.loads(Path(required_env("LAB_CONFIG")).read_text())
  if lab["region"] != REGION:
    raise ValueError(f"Only {REGION} is supported")
  return lab


def direct_config() -> BotoConfig:
  """Bounded regional SigV4 requests with inherited proxies disabled."""
  return BotoConfig(
    signature_version="v4",
    proxies={},
    connect_timeout=10,
    read_timeout=20,
    retries={"mode": "standard", "total_max_attempts": 3},
  )


def proxy_config(url: str) -> BotoConfig:
  """HTTPS CONNECT proxy while keeping end-to-end AWS TLS (no forwarding mode)."""
  if urlsplit(url).scheme != "https":
    raise ValueError("Use an HTTPS proxy URL")
  return direct_config().merge(
    BotoConfig(
      proxies={"https": url},
      proxies_config={"proxy_use_forwarding_for_https": False},
    )
  )


def service_client(session: boto3.Session, service: str, url: str, config: BotoConfig) -> Any:
  """Keep the AWS endpoint URL, Seoul signing region and TLS verification."""
  parsed = urlsplit(url)
  if parsed.scheme != "https" or not parsed.hostname or parsed.username:
    raise ValueError("An HTTPS endpoint without URL credentials is required")
  return session.client(service, region_name=REGION, endpoint_url=url, config=config)


def initial_session() -> boto3.Session:
  """Start from the named local AWS profile."""
  return boto3.Session(profile_name=required_env("AWS_PROFILE"), region_name=REGION)


def assume_lab_role(lab: dict, sts_url: str, config: BotoConfig) -> boto3.Session:
  """Exchange the profile identity for the lab role through the proxy path."""
  sts = service_client(initial_session(), "sts", sts_url, config)
  result = sts.assume_role(
    RoleArn=lab["role_arn"], RoleSessionName="scenario-memory", DurationSeconds=900
  )["Credentials"]
  print("STS_CREDENTIALS_OK", flush=True)
  return boto3.Session(
    aws_access_key_id=result["AccessKeyId"],
    aws_secret_access_key=result["SecretAccessKey"],
    aws_session_token=result["SessionToken"],
    region_name=REGION,
  )


def event_payload(text: str) -> list[dict]:
  return [{"conversational": {"role": "USER", "content": {"text": text}}}]


def memory_round_trip(memory: Any, memory_id: str) -> None:
  """Write/read one event, verify its content, and delete it even on a read failure."""
  identifiers = {
    "memoryId": memory_id,
    "actorId": "static-ip-client",
    "sessionId": f"probe-{uuid4().hex}",
  }
  text = f"NLB static IP probe {uuid4().hex}"
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
  lab = load_lab()
  config = proxy_config(lab["proxy_url"])
  session = assume_lab_role(lab, f"https://{lab['services']['sts']['hostname']}", config)
  memory = service_client(
    session, "bedrock-agentcore", f"https://{lab['services']['memory']['hostname']}", config
  )
  memory_round_trip(memory, lab["memory_id"])
  print("PASS S07 public NLB -> CONNECT proxy + STS")


if __name__ == "__main__":
  try:
    main()
  except (BotoCoreError, ClientError, KeyError, OSError, RuntimeError, ValueError) as error:
    print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)
