#!/bin/bash
# Vault Transit(암호화) 엔진 활성화 스크립트

set -e

VAULT_ADDR="http://127.0.0.1:8200"
VAULT_TOKEN="root-token"

echo "=== Vault Transit 엔진 설정 ==="
echo ""

# Transit 엔진 활성화
echo "[1] Transit secret engine 활성화"
curl -s --header "X-Vault-Token: ${VAULT_TOKEN}" \
  --request POST \
  --data '{"type": "transit"}' \
  "${VAULT_ADDR}/v1/sys/mounts/transit"
echo "  완료"
echo ""

# 암호화 키 생성
echo "[2] 암호화 키 생성: my-app-key"
curl -s --header "X-Vault-Token: ${VAULT_TOKEN}" \
  --request POST \
  --data '{"type": "aes256-gcm96"}' \
  "${VAULT_ADDR}/v1/transit/keys/my-app-key"
echo "  완료"
echo ""

# 키 확인
echo "[3] 생성된 키 확인"
curl -s --header "X-Vault-Token: ${VAULT_TOKEN}" \
  "${VAULT_ADDR}/v1/transit/keys/my-app-key" | python3 -m json.tool
echo ""

echo "=== 설정 완료 ==="
echo "Vault 주소: ${VAULT_ADDR}"
echo "Vault 토큰: ${VAULT_TOKEN}"
