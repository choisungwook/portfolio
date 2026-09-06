# 30분 핸즈온

- 실행 위치: `aws/iam/roles-anywhere`. 관리 명령은 `AWS_PROFILE=admin`.
- 클라이언트 인증에는 이 프로파일이 쓰이지 않아요. `run.py`는 임시 설정 파일의 `credential_process`만 보고, 그 명령이 인증서로 서명해요.
- 도구: Terraform, uv, AWS CLI v2, OpenSSL, jq. 비용은 Memory 사용량뿐이라 사실상 0이에요.
- 아래 출력은 2026-09-06 실제 실행 결과예요. 계정 번호만 가렸어요.

## 0. 준비 (2분)

```bash
cd aws/iam/roles-anywhere
uv venv && source .venv/bin/activate && uv sync --frozen
export AWS_PROFILE=admin
python install_helper.py            # 공식 helper 1.8.5, SHA256 검증 후 runtime/bin/에 설치
```

## 1. 사설 CA와 인증서 (1분)

```bash
python pki.py init
openssl x509 -in runtime/pki/clients/v1/client.crt -noout -subject -serial -enddate
```

```text
PKI_READY .../runtime/pki  (ca/ca.crt -> trust anchor, clients/v1 -> client, clients/denied)
subject=CN=memory-client
serial=1000
notAfter=Sep  8 13:31:01 2026 GMT
```

| 생성물 | 용도 |
| --- | --- |
| `runtime/pki/ca/ca.crt`, `ca.key` | 사설 CA. 공개 인증서만 AWS로 감 |
| `runtime/pki/clients/v1/` | CN=memory-client. 정상 클라이언트 |
| `runtime/pki/clients/denied/` | CN=other-client. 같은 CA, 다른 신원 |

- `runtime/`은 git 제외예요. 개인 키는 이 디렉터리를 벗어나지 않아요.

## 2. AWS 리소스 (3분)

trust anchor, profile, IAM Role + 권한 정책, Memory 5개를 만들어요.

```bash
terraform -chdir=terraform init
terraform -chdir=terraform apply
terraform -chdir=terraform output -json lab | jq . > runtime/lab.json
```

- 입력 기본값: `project_name=ra-handson`, `ca_certificate_path=../runtime/pki/ca/ca.crt`, `certificate_common_name=memory-client`. 바꾸려면 `terraform.tfvars`.
- `runtime/lab.json`에는 ARN·Memory ID만 있고 비밀은 없어요. 예제는 [examples/lab.json.example](../examples/lab.json.example).

## 3. 인증서로 인증하고 Memory 호출 (2분)

```bash
python run.py
```

```text
CREDENTIAL_PROVIDER_OK custom-process (aws_signing_helper)
CALLER_IDENTITY_OK arn=arn:aws:sts::<acct>:assumed-role/ra-handson-client/1000
CREATE_EVENT_OK
GET_EVENT_OK payload_matches=true
DELETE_EVENT_OK
PASS certificate -> Roles Anywhere CreateSession -> AgentCore Memory
```

- `custom-process`: boto3가 helper를 자격증명 공급자로 선택했어요. 환경변수 키·프로파일 키는 안 썼어요.
- `assumed-role/ra-handson-client/1000`: 세션 이름이 인증서 serial이에요. CloudTrail에서 이 값으로 인증서를 역추적해요.
- apply 직후 첫 실행에서 `CreateEvent ... no identity-based policy allows`가 나오면 IAM 정책 전파 지연이에요. 몇 초 뒤 다시 실행하면 통과해요(실제로 그랬어요).

## 4. 같은 CA, 다른 CN은 거부 (1분)

```bash
RA_CERTIFICATE="$PWD/runtime/pki/clients/denied/client.crt" \
RA_PRIVATE_KEY="$PWD/runtime/pki/clients/denied/client.key" \
python run.py
```

```text
FAIL CredentialRetrievalError: ... CreateSession, StatusCode: 403,
AccessDeniedException: Unable to assume role for arn:aws:iam::<acct>:role/ra-handson-client.
```

- 인증서 체인은 유효해서 Roles Anywhere 단계(①②③)는 통과했고, Role trust의 `PrincipalTag/x509Subject/CN` 조건(④)에서 막혔어요. "CA 신뢰 ≠ 모든 인증서 허용"의 실물이에요.

## 5. 인증서 교체 (2분)

같은 CN으로 새 키·새 serial을 발급해요. Terraform 변경은 없어요.

```bash
python pki.py issue v2
RA_CERTIFICATE="$PWD/runtime/pki/clients/v2/client.crt" \
RA_PRIVATE_KEY="$PWD/runtime/pki/clients/v2/client.key" \
python run.py
```

```text
ISSUED .../runtime/pki/clients/v2  (same CN, new key and serial)
CALLER_IDENTITY_OK arn=arn:aws:sts::<acct>:assumed-role/ra-handson-client/1002
PASS ...
```

- 세션 이름이 1000 → 1002로 바뀌었어요. 신원(CN)은 같고 키만 바뀐 것이 세션 이름에서 보여요.

## 6. v1 폐기와 CRL (5분)

```bash
python pki.py revoke v1                       # 로컬 발급 DB에 폐기 기록 + revoked.pem 생성
openssl crl -in runtime/pki/ca/revoked.pem -noout -lastupdate -nextupdate
python crl_aws.py import                      # trust anchor에 CRL 등록 (두 번째부터는 update)

RA_CERTIFICATE="$PWD/runtime/pki/clients/v1/client.crt" \
RA_PRIVATE_KEY="$PWD/runtime/pki/clients/v1/client.key" \
python run.py                                 # v1: 거부

RA_CERTIFICATE="$PWD/runtime/pki/clients/v2/client.crt" \
RA_PRIVATE_KEY="$PWD/runtime/pki/clients/v2/client.key" \
python run.py                                 # v2: 여전히 PASS
```

```text
CRL_IMPORTED id=78d97532-... enabled=True
FAIL CredentialRetrievalError: ... AccessDeniedException: Certificate revoked
CALLER_IDENTITY_OK arn=arn:aws:sts::<acct>:assumed-role/ra-handson-client/1002
PASS ...
```

- 업로드 직후 첫 시도부터 거부됐어요. 전파 대기는 필요 없었어요.
- 폐기는 "새 CreateSession"을 막아요. v1으로 이미 받은 1시간짜리 키가 있었다면 그건 만료까지 살아 있어요. [Revoke](1-concept.md#revoke)의 3단계를 참고해요.

## 7. 정리 (2분)

CRL은 Terraform 밖 리소스라 먼저 지워요.

```bash
python crl_aws.py delete
terraform -chdir=terraform destroy
rm -rf runtime/lab.json runtime/pki
```

- helper 바이너리(`runtime/bin`)는 다음에 다시 쓰니 두어도 돼요.

## 더 해 보기 (실습 범위 밖)

- **자동 갱신 관찰**: 같은 프로세스에서 세션 1시간을 넘겨 호출이 계속 성공하는지. `run.py`의 세션을 재사용하는 루프를 75분 돌리고 CloudTrail에 CreateSession이 두 번 찍히는지 보면 돼요.
- **기존 세션 회수**: 폐기 후에도 살아 있는 임시 키를 IAM Role의 Revoke sessions로 끊어 보기.
- **고정 IP 경로**: `rolesanywhere`·`bedrock-agentcore` 두 endpoint를 NLB EIP 뒤에 두는 [S01 패턴](../../../vpc_endpoint/agentcore-memory-static-ip/README.md).
