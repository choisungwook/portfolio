# 검증 결과와 문제 해결

## 2026-09-06 실제 AWS 실행

| 단계 | 결과 |
| --- | --- |
| 사설 CA·v1·denied 발급 | 통과. CA 7일, Leaf 2일 |
| Terraform apply (trust anchor, profile, Role, 정책, Memory) | 5개 생성 |
| v1 인증 → Memory 왕복 | PASS. 첫 시도는 IAM 정책 전파 지연으로 CreateEvent AccessDenied, 재시도 통과 |
| 같은 CA·다른 CN | CreateSession 403 `Unable to assume role` (Role trust CN 조건) |
| v2 교체 | PASS. 세션 이름 1000 → 1002 |
| v1 폐기 + CRL import | 즉시 `Certificate revoked`. v2 PASS 유지 |
| 정리 | CRL delete → destroy |
| 로컬 | ruff, pytest 6개, Terraform mock 3개 |
| 미실행 | 75분 자동 갱신 관찰, 기존 세션 회수, PrivateLink 경로 |

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| `Run: python install_helper.py` | helper 미설치 또는 `SIGNING_HELPER` 경로 |
| `CreateEvent ... no identity-based policy allows` (apply 직후) | IAM 전파 지연. 몇 초 뒤 재실행 |
| `Unable to assume role` | Role trust 조건. CN, SourceArn(trust anchor), SourceAccount 중 불일치 |
| `Certificate revoked` | 활성 CRL에 그 serial이 있음. 의도한 폐기인지 확인 |
| 인증서·키 불일치 | `RA_CERTIFICATE`와 `RA_PRIVATE_KEY`를 같은 디렉터리에서 골랐는지 |
| `MissingDependency ... botocore[crt]` | 관리 셸의 `AWS_PROFILE`이 login 방식 프로파일. admin 사용 |
| `Lab CRL already exists` | `python crl_aws.py update` |
| destroy가 trust anchor에서 실패 | CRL이 남아 있음. `python crl_aws.py delete` 먼저 |
| TLS/DNS/timeout | `rolesanywhere.ap-northeast-2.amazonaws.com`·`bedrock-agentcore...` 443 도달성 |

AWS 없이 인증서·키로 서명이 되는지 먼저 볼 때:

```bash
runtime/bin/aws_signing_helper sign-string \
  --certificate runtime/pki/clients/v1/client.crt \
  --private-key runtime/pki/clients/v1/client.key > /dev/null && echo SIGN_OK
```

로컬 검증:

```bash
python -m ruff check . && python -m pytest -q
terraform -chdir=terraform init -backend=false && terraform -chdir=terraform validate && terraform -chdir=terraform test
```
