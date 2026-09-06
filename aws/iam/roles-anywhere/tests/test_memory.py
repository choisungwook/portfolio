from datetime import UTC, datetime

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.stub import ANY, Stubber

from client.memory import memory_client, round_trip


@pytest.mark.parametrize("failure", [None, "mismatch", "denied"])
def test_memory_round_trip_validates_aws_models_and_always_cleans_up(monkeypatch, failure):
  monkeypatch.setattr("client.memory.uuid4", lambda: type("UUID", (), {"hex": "a" * 32})())
  session = boto3.Session(aws_access_key_id="ASIAEXAMPLE", aws_secret_access_key="fake-secret")
  memory = memory_client(session)
  identifiers = {
    "memoryId": "test_memory-1234567890",
    "actorId": "ra-client",
    "sessionId": "probe-" + "a" * 32,
  }
  event = {
    **identifiers,
    "eventId": "0000000001#12345678-1234-1234-1234-123456789012",
    "eventTimestamp": datetime.now(UTC),
    "payload": [{"conversational": {"role": "USER", "content": {"text": "RA probe " + "a" * 32}}}],
  }
  request = {**identifiers, "eventId": event["eventId"]}
  with Stubber(memory) as stubber:
    stubber.add_response(
      "create_event",
      {"event": event},
      {
        **identifiers,
        "eventTimestamp": ANY,
        "clientToken": "a" * 32,
        "payload": event["payload"],
      },
    )
    if failure == "denied":
      stubber.add_client_error(
        "get_event", service_error_code="AccessDeniedException", expected_params=request
      )
    else:
      received = {**event, "payload": []} if failure == "mismatch" else event
      stubber.add_response("get_event", {"event": received}, request)
    stubber.add_response("delete_event", {"eventId": event["eventId"]}, request)
    if failure:
      with pytest.raises((RuntimeError, ClientError)):
        round_trip(memory, identifiers["memoryId"])
    else:
      round_trip(memory, identifiers["memoryId"])
    stubber.assert_no_pending_responses()
  memory.close()
