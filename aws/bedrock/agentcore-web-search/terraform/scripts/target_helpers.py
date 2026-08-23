from typing import Any


def find_target(client: Any, gateway_id: str, target_name: str) -> str | None:
  """Return an existing gateway target ID with the requested name."""
  paginator = client.get_paginator("list_gateway_targets")
  for page in paginator.paginate(gatewayIdentifier=gateway_id):
    for item in page["items"]:
      if item["name"] == target_name:
        return str(item["targetId"])
  return None
