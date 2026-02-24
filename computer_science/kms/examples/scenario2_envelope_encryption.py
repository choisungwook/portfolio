"""
Scenario 2: Envelope Encryption (봉투 암호화)

GenerateDataKey API로 Data Key를 생성하고, 로컬에서 데이터를 암호화합니다.
대용량 데이터를 KMS로 직접 보내지 않고 로컬에서 처리하는 패턴입니다.

흐름:
  1. KMS에서 Data Key 생성 (평문 + 암호화된 Data Key)
  2. 평문 Data Key로 로컬 데이터 암호화
  3. 평문 Data Key는 메모리에서 삭제
  4. 암호화된 Data Key + 암호화된 데이터를 저장
  5. 복호화 시: 암호화된 Data Key를 KMS로 복호화 → 데이터 복호화
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


def encrypt_local(key: bytes, plaintext: bytes) -> tuple[bytes, bytes]:
  """AES-GCM으로 로컬 암호화. (nonce, ciphertext) 반환."""
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM

  aesgcm = AESGCM(key)
  nonce = os.urandom(12)
  ciphertext = aesgcm.encrypt(nonce, plaintext, None)
  return nonce, ciphertext


def decrypt_local(key: bytes, nonce: bytes, ciphertext: bytes) -> bytes:
  """AES-GCM으로 로컬 복호화."""
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM

  aesgcm = AESGCM(key)
  return aesgcm.decrypt(nonce, ciphertext, None)


def generate_data_key(kms) -> tuple[bytes, bytes]:
  """KMS에서 Data Key를 생성하고 (평문 Data Key, 암호화된 Data Key)를 반환한다."""
  print(f"[Step 1] KMS에서 Data Key 생성 (Wrapping Key: {KEY_ALIAS})")

  response = kms.generate_data_key(
    KeyId=KEY_ALIAS,
    KeySpec="AES_256",
  )

  plaintext_key = response["Plaintext"]
  encrypted_key = response["CiphertextBlob"]

  print(f"  Wrapping Key ARN: {response['KeyId']}")
  print(f"  Data Key (평문, hex): {plaintext_key.hex()[:40]}...")
  print(f"  Data Key (암호화, base64): {base64.b64encode(encrypted_key).decode()[:40]}...")
  print(f"  Data Key 길이: {len(plaintext_key)} bytes (AES-256)")

  return plaintext_key, encrypted_key


def envelope_encrypt(plaintext_key: bytes, data: str) -> tuple[bytes, bytes]:
  """평문 Data Key로 데이터를 로컬 암호화한다."""
  print("\n[Step 2] 평문 Data Key로 로컬 데이터 암호화")

  data_bytes = data.encode("utf-8")
  print(f"  원본 데이터 크기: {len(data_bytes)} bytes")

  nonce, ciphertext = encrypt_local(plaintext_key, data_bytes)
  print(f"  암호화된 데이터 크기: {len(ciphertext)} bytes")

  return nonce, ciphertext


def print_stored_data(encrypted_key: bytes, nonce: bytes, ciphertext: bytes):
  """저장할 데이터를 출력한다."""
  print("\n[Step 4] 저장할 데이터")
  print(f"  암호화된 Data Key: {base64.b64encode(encrypted_key).decode()[:40]}...")
  print(f"  Nonce: {nonce.hex()}")
  print(f"  암호화된 데이터: {ciphertext.hex()[:40]}...")


def envelope_decrypt(kms, encrypted_key: bytes, nonce: bytes, ciphertext: bytes) -> str:
  """암호화된 Data Key를 KMS로 복호화한 뒤 데이터를 복호화한다."""
  print("\n[Step 5] 복호화 흐름")

  print("  5-1. 암호화된 Data Key를 KMS로 복호화")
  response = kms.decrypt(CiphertextBlob=encrypted_key)
  recovered_key = response["Plaintext"]
  print(f"  복호화된 Data Key (hex): {recovered_key.hex()[:40]}...")

  print("  5-2. 복호화된 Data Key로 데이터 복호화")
  decrypted_data = decrypt_local(recovered_key, nonce, ciphertext)
  print(f"  복호화된 데이터 크기: {len(decrypted_data)} bytes")

  return decrypted_data.decode("utf-8")


def verify_and_summarize(original: str, decrypted: str, encrypted_key: bytes):
  """검증 결과와 요약을 출력한다."""
  print("\n[Step 6] 검증")
  if original == decrypted:
    print("  결과: 성공! 원본과 복호화 결과가 일치합니다")
  else:
    print("  결과: 실패! 원본과 복호화 결과가 다릅니다")

  print("\n--- 정리 ---")
  print("핵심: KMS로 보낸 것은 작은 Data Key뿐입니다.")
  print(f"  KMS로 전송한 데이터: {len(encrypted_key)} bytes (Data Key)")
  print(f"  로컬에서 처리한 데이터: {len(original.encode('utf-8'))} bytes (원본 데이터)")


def main():
  kms = create_kms_client()

  print("=== Scenario 2: Envelope Encryption (봉투 암호화) ===\n")

  # 암호화
  plaintext_key, encrypted_key = generate_data_key(kms)
  original_data = "대용량 데이터를 KMS로 직접 보내지 않고 로컬에서 암호화합니다. " * 10
  nonce, ciphertext = envelope_encrypt(plaintext_key, original_data)

  # 평문 Data Key 삭제 (보안)
  print("\n[Step 3] 평문 Data Key를 메모리에서 삭제")
  del plaintext_key
  print("  평문 Data Key 삭제 완료 (암호화된 Data Key만 보관)")

  print_stored_data(encrypted_key, nonce, ciphertext)

  # 복호화
  decrypted_text = envelope_decrypt(kms, encrypted_key, nonce, ciphertext)
  verify_and_summarize(original_data, decrypted_text, encrypted_key)


if __name__ == "__main__":
  main()
