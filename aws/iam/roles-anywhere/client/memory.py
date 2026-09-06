from datetime import UTC, datetime
from uuid import uuid4

import boto3
from botocore.config import Config

from client.config import REGION


def memory_client(session: boto3.Session):
  """Create a Seoul Memory client retaining its refreshable credential provider."""
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


def write_event(memory, memory_id: str) -> tuple[dict, list]:
  """Write a unique short-term event and return the lookup keys and expected payload."""
  identifiers = {"memoryId": memory_id, "actorId": "ra-client", "sessionId": f"probe-{uuid4().hex}"}
  payload = [{"conversational": {"role": "USER", "content": {"text": f"RA probe {uuid4().hex}"}}}]
  event = memory.create_event(
    **identifiers, eventTimestamp=datetime.now(UTC), clientToken=uuid4().hex, payload=payload
  )["event"]
  print("CREATE_EVENT_OK", flush=True)
  return {**identifiers, "eventId": event["eventId"]}, payload


def round_trip(memory, memory_id: str) -> None:
  """Verify a Memory write/read and attempt cleanup even when reading fails."""
  request, expected = write_event(memory, memory_id)
  try:
    if memory.get_event(**request)["event"].get("payload") != expected:
      raise RuntimeError("The returned event content differs from the written content")
    print("GET_EVENT_OK payload_matches=true", flush=True)
  finally:
    memory.delete_event(**request)
    print("DELETE_EVENT_OK", flush=True)
