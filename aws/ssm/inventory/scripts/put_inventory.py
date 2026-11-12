# /// script
# requires-python = ">=3.12"
# dependencies = ["boto3>=1.40"]
# ///
"""managed node 하나에 Custom:AppDeployment inventory를 PutInventory로 기록한다."""

import argparse
import json
from datetime import UTC, datetime

import boto3

TYPE_NAME = "Custom:AppDeployment"


def build_item(schema_version: str, apps: list[dict[str, str]]) -> dict:
  """PutInventory Items 원소 하나를 만든다.

  Args:
    schema_version: custom type 버전. DisableSchema 이후에는 더 큰 값이어야 한다.
    apps: Content 행 목록. 값은 모두 문자열이어야 한다.

  Returns:
    InventoryItem dict.
  """
  return {
    "TypeName": TYPE_NAME,
    "SchemaVersion": schema_version,
    "CaptureTime": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "Content": apps,
  }


def load_apps(path: str) -> list[dict[str, str]]:
  """Content로 보낼 행 목록을 JSON 파일에서 읽는다."""
  with open(path, encoding="utf-8") as f:
    return json.load(f)


def parse_args() -> argparse.Namespace:
  """CLI 인자를 읽는다."""
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("instance_id", help="i-... 또는 mi-... managed node ID")
  parser.add_argument("--apps", default="examples/app-deployment.json")
  parser.add_argument("--schema-version", default="1.0")
  parser.add_argument("--region", default="ap-northeast-2")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  ssm = boto3.client("ssm", region_name=args.region)
  item = build_item(args.schema_version, load_apps(args.apps))
  ssm.put_inventory(InstanceId=args.instance_id, Items=[item])
  print(f"PutInventory OK: {args.instance_id} {TYPE_NAME} v{args.schema_version} rows={len(item['Content'])}")


if __name__ == "__main__":
  main()
