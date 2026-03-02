# AWS KMS AWS CLI 예제

AWS KMS(Key Management Service)를 AWS CLI로 사용하는 예제입니다. 실제 본문 데이터의 로컬 암복호화는 애플리케이션 코드(Python/Go 등)에서 수행하는 것을 권장합니다.

## 사전 조건

1. AWS CLI v2가 설치되어 있어야 합니다
2. AWS 자격 증명이 설정되어 있어야 합니다 (`aws configure` 또는 환경변수)
3. 프로젝트 루트의 `terraform/`으로 KMS 키가 생성되어 있어야 합니다
4. `openssl`이 설치되어 있어야 합니다 (base64 디코딩 및 로컬 암복호화용)

## 공통 변수 준비

`AWS_REGION`은 이미 환경 변수로 설정되어 있다고 가정합니다.

```bash
KMS_KEY_ARN=$(aws kms describe-key \
  --key-id alias/kms-handson-symmetric \
  --query 'KeyMetadata.Arn' \
  --output text)
```

## Scenario 1: 기본 암호화/복호화

```bash
PLAINTEXT="hello, AWS KMS"

CIPHERTEXT_B64=$(aws kms encrypt \
  --key-id "$KMS_KEY_ARN" \
  --plaintext "$PLAINTEXT" \
  --cli-binary-format raw-in-base64-out \
  --query 'CiphertextBlob' \
  --output text)

DECRYPTED_B64=$(aws kms decrypt \
  --ciphertext-blob "$CIPHERTEXT_B64" \
  --query 'Plaintext' \
  --output text)

DECRYPTED_TEXT=$(printf '%s' "$DECRYPTED_B64" | openssl base64 -d -A)
echo "$DECRYPTED_TEXT"
```

## Scenario 1-1: decrypt 응답 구조 확인 (Plaintext vs KeyId)

`DECRYPTED_B64`는 `--query 'Plaintext'`로 추출한 값이라 복호화된 평문(base64)만 담습니다. wrapper key 식별자는 `decrypt`의 원본 응답에서 `KeyId`로 확인해야 합니다.

```bash
aws kms decrypt \
  --ciphertext-blob "$CIPHERTEXT_B64" \
  --output json

aws kms decrypt \
  --ciphertext-blob "$CIPHERTEXT_B64" \
  --query '{KeyId:KeyId,Plaintext:Plaintext}' \
  --output json
```

- `Plaintext`: 복호화 결과(base64)
- `KeyId`: 복호화에 사용된 KMS wrapping key의 식별자
- 참고: 실제 wrapping key 바이트는 응답에 포함되지 않습니다.

## Scenario 2: Envelope Encryption (Data Key 흐름)

Scenario 1의 `encrypt/decrypt`는 "KMS가 데이터 암복호화 자체를 수행"하는 호출입니다.
Scenario 2는 "KMS는 Data Key만 보호하고, 실제 데이터 암복호화는 애플리케이션 로컬에서 수행"하는 패턴입니다.

`generate-data-key`를 쓰는 이유는 로컬에서 대용량 데이터를 처리하고, KMS에는 작은 Data Key만 전달하기 위해서입니다.

### Step 1: Data Key 생성

`generate-data-key`는 두 가지를 동시에 반환합니다:

- **`Plaintext`**: 평문 Data Key — 로컬 암호화에 바로 사용하고, 사용 후 즉시 삭제합니다
- **`CiphertextBlob`**: 암호화된 Data Key — KMS wrapping key로 암호화된 사본으로, 데이터와 함께 안전하게 보관합니다

```bash
read -r PLAINTEXT_DATA_KEY_B64 ENCRYPTED_DATA_KEY_B64 <<< "$(aws kms generate-data-key \
  --key-id "$KMS_KEY_ARN" \
  --key-spec AES_256 \
  --query '[Plaintext,CiphertextBlob]' \
  --output text)"
```

### Step 2: 평문 Data Key로 로컬 데이터 암호화

openssl `enc -aes-256-cbc`로 실제 데이터를 암호화합니다. Data Key를 hex로 변환하고, IV(초기화 벡터)를 생성합니다.

```bash
ORIGINAL_DATA="대용량 데이터를 KMS로 직접 보내지 않고 로컬에서 암호화합니다."

DATA_KEY_HEX=$(printf '%s' "$PLAINTEXT_DATA_KEY_B64" | openssl base64 -d -A | xxd -p -c 256)

IV_HEX=$(openssl rand -hex 16)

ENCRYPTED_DATA_B64=$(printf '%s' "$ORIGINAL_DATA" | openssl enc -aes-256-cbc \
  -K "$DATA_KEY_HEX" \
  -iv "$IV_HEX" \
  -base64 -A)
```

### Step 3: 평문 Data Key 메모리에서 삭제

암호화가 끝났으므로 평문 Data Key를 삭제합니다. 이후에는 암호화된 Data Key만 보관합니다.

```bash
unset PLAINTEXT_DATA_KEY_B64
unset DATA_KEY_HEX
```

### Step 4: 저장할 데이터 확인

실제 저장하는 값은 아래 3가지입니다. 평문 Data Key는 이미 삭제되어 없습니다.

```bash
echo "암호화된 Data Key: $ENCRYPTED_DATA_KEY_B64"
echo "IV: $IV_HEX"
echo "암호화된 데이터: $ENCRYPTED_DATA_B64"
```

### Step 5: 복호화 흐름

#### 5-1: 암호화된 Data Key를 KMS로 복구

```bash
RECOVERED_DATA_KEY_B64=$(aws kms decrypt \
  --ciphertext-blob "$ENCRYPTED_DATA_KEY_B64" \
  --query 'Plaintext' \
  --output text)

RECOVERED_KEY_HEX=$(printf '%s' "$RECOVERED_DATA_KEY_B64" | openssl base64 -d -A | xxd -p -c 256)
```

#### 5-2: 복구된 Data Key로 데이터 복호화

```bash
DECRYPTED_DATA=$(printf '%s' "$ENCRYPTED_DATA_B64" | openssl enc -d -aes-256-cbc \
  -K "$RECOVERED_KEY_HEX" \
  -iv "$IV_HEX" \
  -base64 -A)
```

### Step 6: 검증

```bash
if [ "$ORIGINAL_DATA" = "$DECRYPTED_DATA" ]; then
  echo "성공! 원본과 복호화 결과가 일치합니다"
else
  echo "실패! 원본과 복호화 결과가 다릅니다"
fi
```

## Scenario 3: 키 관리

```bash
aws kms list-keys \
  --query 'Keys[:5].KeyId' \
  --output table

aws kms list-aliases \
  --query 'Aliases[?starts_with(AliasName, `alias/aws/`) == `false`].[AliasName,TargetKeyId]' \
  --output table

aws kms describe-key \
  --key-id "$KMS_KEY_ARN" \
  --query 'KeyMetadata.{KeyId:KeyId,Arn:Arn,KeyState:KeyState,KeySpec:KeySpec,KeyUsage:KeyUsage,KeyManager:KeyManager,MultiRegion:MultiRegion}' \
  --output table

KEY_ID=$(aws kms describe-key \
  --key-id "$KMS_KEY_ARN" \
  --query 'KeyMetadata.KeyId' \
  --output text)

aws kms get-key-rotation-status \
  --key-id "$KEY_ID" \
  --output table
```
