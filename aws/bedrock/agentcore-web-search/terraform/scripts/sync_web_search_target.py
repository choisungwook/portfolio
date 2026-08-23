import json
import os

import boto3
from target_helpers import find_target


def main() -> None:
  """Create or update the managed Web Search connector target."""
  gateway_id = os.environ["GATEWAY_ID"]
  target_name = os.environ["TARGET_NAME"]
  configuration = json.loads(os.environ["TARGET_CONFIGURATION"])
  client = boto3.client("bedrock-agentcore-control", region_name=os.environ["AWS_REGION"])
  target_id = find_target(client, gateway_id, target_name)
  request = {
    "gatewayIdentifier": gateway_id,
    "name": target_name,
    "targetConfiguration": configuration,
    "credentialProviderConfigurations": [{"credentialProviderType": "GATEWAY_IAM_ROLE"}],
  }
  if target_id is None:
    client.create_gateway_target(**request)
    return
  client.update_gateway_target(targetId=target_id, **request)


if __name__ == "__main__":
  main()
