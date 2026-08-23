import os

import boto3
from target_helpers import find_target


def main() -> None:
  """Delete the managed Web Search connector target when it exists."""
  gateway_id = os.environ["GATEWAY_ID"]
  client = boto3.client("bedrock-agentcore-control", region_name=os.environ["AWS_REGION"])
  target_id = find_target(client, gateway_id, os.environ["TARGET_NAME"])
  if target_id is not None:
    client.delete_gateway_target(gatewayIdentifier=gateway_id, targetId=target_id)


if __name__ == "__main__":
  main()
