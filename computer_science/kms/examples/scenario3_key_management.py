"""
Scenario 3: 키 관리

KMS 키의 목록 조회, 상세 정보, 별칭, 키 회전 상태를 확인합니다.
"""

import os

import boto3
from dotenv import load_dotenv

load_dotenv()

REGION = os.environ["AWS_REGION"]
KEY_ALIAS = os.environ["KMS_KEY_ALIAS"]


def create_kms_client():
  return boto3.client("kms", region_name=REGION)


def list_keys(kms):
  """KMS 키 목록을 조회한다."""
  print("[Step 1] KMS 키 목록 조회")

  response = kms.list_keys()
  keys = response["Keys"]

  print(f"  총 {len(keys)}개의 키가 있습니다")
  for key in keys[:5]:
    print(f"  - KeyId: {key['KeyId']}")
  if len(keys) > 5:
    print(f"  ... 외 {len(keys) - 5}개")


def list_custom_aliases(kms):
  """사용자가 생성한 키 별칭을 조회한다."""
  print(f"\n[Step 2] 키 별칭 조회")

  response = kms.list_aliases()
  aliases = response["Aliases"]

  custom_aliases = [a for a in aliases if not a["AliasName"].startswith("alias/aws/")]
  print(f"  사용자 생성 별칭: {len(custom_aliases)}개")
  for alias in custom_aliases:
    target = alias.get("TargetKeyId", "N/A")
    print(f"  - {alias['AliasName']} → {target}")


def describe_key(kms) -> dict:
  """특정 키의 상세 정보를 조회한다."""
  print(f"\n[Step 3] 키 상세 정보 ({KEY_ALIAS})")

  response = kms.describe_key(KeyId=KEY_ALIAS)
  metadata = response["KeyMetadata"]

  print(f"  KeyId: {metadata['KeyId']}")
  print(f"  ARN: {metadata['Arn']}")
  print(f"  상태: {metadata['KeyState']}")
  print(f"  생성일: {metadata['CreationDate']}")
  print(f"  알고리즘: {metadata.get('KeySpec', 'N/A')}")
  print(f"  용도: {metadata.get('KeyUsage', 'N/A')}")
  print(f"  관리자: {metadata.get('KeyManager', 'N/A')}")
  print(f"  멀티리전: {metadata.get('MultiRegion', False)}")

  return metadata


def check_key_rotation(kms, key_id: str) -> bool:
  """키 회전 상태를 확인한다."""
  print(f"\n[Step 4] 키 회전 상태 확인")

  response = kms.get_key_rotation_status(KeyId=key_id)
  rotation_enabled = response["KeyRotationEnabled"]

  print(f"  자동 회전 활성화: {rotation_enabled}")
  if rotation_enabled:
    rotation_period = response.get("RotationPeriodInDays")
    if rotation_period:
      print(f"  회전 주기: {rotation_period}일")
    next_rotation = response.get("NextRotationDate")
    if next_rotation:
      print(f"  다음 회전 예정일: {next_rotation}")

  return rotation_enabled


def print_summary(metadata: dict, rotation_enabled: bool):
  """키 상태 요약을 출력한다."""
  rotation_text = "활성화" if rotation_enabled else "비활성화"
  print("\n--- 정리 ---")
  print(f"키 별칭 '{KEY_ALIAS}'의 현재 상태:")
  print(f"  상태={metadata['KeyState']}, 회전={rotation_text}")


def main():
  kms = create_kms_client()

  print("=== Scenario 3: 키 관리 ===\n")

  list_keys(kms)
  list_custom_aliases(kms)
  metadata = describe_key(kms)
  rotation_enabled = check_key_rotation(kms, metadata["KeyId"])
  print_summary(metadata, rotation_enabled)


if __name__ == "__main__":
  main()
