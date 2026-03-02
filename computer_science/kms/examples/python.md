# AWS KMS Python SDK 예제

AWS KMS(Key Management Service)를 Python SDK(boto3)로 사용하는 예제입니다.

## 사전 조건

1. AWS 자격 증명이 설정되어 있어야 합니다 (`aws configure` 또는 환경변수)
2. 프로젝트 루트의 `terraform/`으로 KMS 키가 생성되어 있어야 합니다
   - 키 별칭: `alias/kms-handson-symmetric`
3. [uv](https://docs.astral.sh/uv/)가 설치되어 있어야 합니다

## 환경 설정

```bash
cd examples
cp .env.example .env
uv sync
```

## 시나리오별 실행

### Scenario 1: 기본 암호화/복호화

KMS의 `encrypt`/`decrypt` API로 데이터를 암호화하고 복호화합니다.

```bash
cd examples
uv run python scenario1_encrypt_decrypt.py
```

### Scenario 2: Envelope Encryption

`GenerateDataKey` API로 Data Key를 생성하고, 로컬에서 데이터를 암호화하는 봉투 암호화 패턴입니다.

```bash
cd examples
uv run python scenario2_envelope_encryption.py
```

### Scenario 3: 키 관리

키 목록 조회, 키 상세 정보, 별칭 조회, 키 회전 상태를 확인합니다.

```bash
cd examples
uv run python scenario3_key_management.py
```
