"""
Scenario 1: 기본 암호화/복호화

KMS의 encrypt/decrypt API를 사용하여 데이터를 암호화하고 복호화합니다.
Terraform으로 생성한 키(alias/kms-handson-symmetric)를 사용합니다.
"""

import base64
import os

import boto3
from dotenv import load_dotenv

load_dotenv()

REGION = os.environ["AWS_REGION"]
KEY_ALIAS = os.environ["KMS_KEY_ALIAS"]


def create_kms_client():
  return boto3.client("kms", region_name=REGION)


def encrypt_data(kms, plaintext: str) -> bytes:
  """KMS로 평문을 암호화하고 암호문(CiphertextBlob)을 반환한다.

  AWS KMS 내부 동작:
    1. alias(kms-handson-symmetric) → 실제 KeyId(UUID)로 변환
    2. HSM 내부에서 CMK(Customer Master Key) 조회 — CMK는 절대 KMS 밖으로 나가지 않음
    3. HSM 내부에서 AES-256-GCM 암호화 수행
    4. CiphertextBlob 반환 — 암호문 + 키 메타데이터(어떤 CMK를 사용했는지) 포함
  """
  print(f"\n[Step 2] KMS 암호화 (키: {KEY_ALIAS})")

  # KeyId에 alias를 넘기면 KMS가 내부적으로 실제 KeyId(UUID)로 변환한다
  response = kms.encrypt(
    KeyId=KEY_ALIAS,
    Plaintext=plaintext.encode("utf-8"),
  )

  ciphertext_blob = response["CiphertextBlob"]
  ciphertext_b64 = base64.b64encode(ciphertext_blob).decode("utf-8")

  print(f"  사용된 키 ARN: {response['KeyId']}")
  print(f"  암호문 (base64): {ciphertext_b64[:60]}...")
  print(f"  암호문 길이: {len(ciphertext_blob)} bytes")

  return ciphertext_blob


def decrypt_data(kms, ciphertext_blob: bytes) -> str:
  """KMS로 암호문을 복호화하고 평문 문자열을 반환한다.

  AWS KMS 내부 동작:
    1. CiphertextBlob에서 메타데이터 추출 → 어떤 CMK로 암호화했는지 확인
    2. HSM 내부에서 해당 CMK 조회
    3. HSM 내부에서 복호화 수행 → 평문 반환

  KeyId를 지정하지 않아도 되는 이유:
    CiphertextBlob 안에 이미 키 메타데이터가 포함되어 있기 때문이다.
  """
  print("\n[Step 3] KMS 복호화")

  # CiphertextBlob에 키 정보가 포함되어 있으므로 KeyId 지정 불필요
  response = kms.decrypt(CiphertextBlob=ciphertext_blob)
  decrypted = response["Plaintext"].decode("utf-8")

  print(f"  복호화된 데이터: {decrypted}")
  return decrypted


def verify_result(original: str, decrypted: str):
  """원본과 복호화 결과를 비교하여 검증한다."""
  print("\n[Step 4] 검증")
  if original == decrypted:
    print("  결과: 성공! 원본과 복호화 결과가 일치합니다")
  else:
    print("  결과: 실패! 원본과 복호화 결과가 다릅니다")


def encrypt_multiple_secrets(kms):
  """여러 민감 데이터를 한 번에 암호화하는 예시."""
  print("\n--- 추가: 여러 민감 데이터 암호화 ---")

  secrets = {
    "db_password": "super-secret-password",
    "api_key": "sk-1234567890abcdef",
  }

  for name, value in secrets.items():
    resp = kms.encrypt(KeyId=KEY_ALIAS, Plaintext=value.encode("utf-8"))
    encrypted = base64.b64encode(resp["CiphertextBlob"]).decode("utf-8")
    print(f"  {name}: {value} → {encrypted[:40]}...")


def main():
  kms = create_kms_client()

  print("=== Scenario 1: 기본 암호화/복호화 ===\n")

  plaintext = "hello, AWS KMS!"
  print(f"[Step 1] 평문 데이터: {plaintext}")

  ciphertext_blob = encrypt_data(kms, plaintext)
  decrypted_text = decrypt_data(kms, ciphertext_blob)
  verify_result(plaintext, decrypted_text)
  encrypt_multiple_secrets(kms)


if __name__ == "__main__":
  main()
