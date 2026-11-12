# /// script
# requires-python = ">=3.12"
# dependencies = ["boto3>=1.40"]
# ///
"""ECS task, Lambda 함수 같은 managed node가 아닌 ID로 PutInventory를 호출해 거부 사유를 확인한다."""

import argparse

import boto3
from botocore.exceptions import ClientError

PROBE_ITEM = {
  "TypeName": "Custom:Probe",
  "SchemaVersion": "1.0",
  "CaptureTime": "2026-01-01T00:00:00Z",
  "Content": [{"Note": "probe"}],
}


def build_targets(account_id: str, region: str, instance_id: str) -> dict[str, str]:
  """대상 이름과 PutInventory InstanceId 후보를 만든다.

  ECS task와 Lambda는 실제로 만들지 않아도 된다. 서버가 ID 형식에서 먼저 거부하기 때문이다.
  """
  return {
    "EC2 managed node": instance_id,
    "ECS task ID": "0123456789abcdef0123456789abcdef",
    "ECS task ARN": f"arn:aws:ecs:{region}:{account_id}:task/demo/0123456789abcdef0123456789abcdef",
    "ECS Exec target": "ecs:demo_0123456789abcdef0123456789abcdef_0123456789abcdef0123456789abcdef-1234567890",
    "Lambda name": "demo-function",
    "Lambda ARN": f"arn:aws:lambda:{region}:{account_id}:function:demo-function",
    "형식만 맞는 없는 EC2 ID": "i-0123456789abcdef0",
  }


def probe(ssm, instance_id: str) -> str:
  """PutInventory를 한 번 호출하고 결과를 한 줄로 돌려준다."""
  try:
    ssm.put_inventory(InstanceId=instance_id, Items=[PROBE_ITEM])
    return "OK"
  except ClientError as error:
    return error.response["Error"]["Code"]


def delete_probe_type(ssm) -> None:
  """probe가 성공해 생긴 Custom:Probe 타입을 지운다. custom type은 계정당 20개라 남기지 않는다."""
  ssm.delete_inventory(TypeName=PROBE_ITEM["TypeName"], SchemaDeleteOption="DeleteSchema")


def main() -> None:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("instance_id", help="정상 비교 대상인 EC2 managed node ID")
  parser.add_argument("--region", default="ap-northeast-2")
  args = parser.parse_args()

  ssm = boto3.client("ssm", region_name=args.region)
  account_id = boto3.client("sts", region_name=args.region).get_caller_identity()["Account"]
  results = {name: probe(ssm, target) for name, target in build_targets(account_id, args.region, args.instance_id).items()}
  for name, result in results.items():
    print(f"{name:<28} {result}")
  if "OK" in results.values():
    delete_probe_type(ssm)


if __name__ == "__main__":
  main()
