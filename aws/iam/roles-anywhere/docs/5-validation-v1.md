# 검증 결과와 문제 해결

## 확인한 범위

| 항목 | 결과 |
| --- | --- |
| Python lint | 통과 |
| Python 테스트 | 11개 통과 |
| 실제 로컬 CA·인증서 발급 | 통과 |
| 실제 로컬 CRL 검사 | v1 폐기 후 v1 거부·v2 유효 확인 |
| SDK provider | 환경변수 키보다 우선 선택, 같은 provider에서 helper 재실행 확인 |
| 실패 시 처리 | helper 거부 시 다른 키로 우회하지 않음, Memory 조회 실패 시 삭제 시도 |
| Terraform validate | 통과 |
| Terraform 관리 인증 A·B | 실제 AWS provider + 모의 CLI·STS로 A의 credential_process → AssumeRole, B의 환경변수 키 사용과 서울 서명 확인 |
| B의 STS 실패 처리 | Bash·Zsh에서 CLI 실패·토큰 누락 시 부분 키·이전 키가 남지 않는지 확인 |
| 실제 AWS 관리 인증·로그인 갱신 | 미검증. 이전 로컬 로그인에서 OAuth 갱신 실패 확인 |
| Terraform mock 테스트 | 최초 plan·권한 경계·빈 CN 거부, 3개 통과 |
| 공식 helper | 1.8.5 macOS arm64 SHA256과 로컬 실행 확인 |
| 실제 helper 서명 진단 | macOS helper로 생성한 Leaf 인증서·개인 키의 로컬 서명 성공 |
| 실제 AWS CreateSession·Memory 호출 | 미실행 |
| 실제 AWS CRL 반영·75분 갱신 관찰 | 미실행 |

- 모의 Terraform apply는 mock provider를 사용해요. 실제 AWS 리소스를 만들지 않아요.
- provider의 HTTP 검증은 임시 AWS config·모의 CLI·가짜 키를 사용해요. `aws login`·CLI의 로그인 캐시 갱신·AWS trust policy·배포 권한·장시간 갱신은 검증 범위에 포함하지 않아요.
- 실제 관리 인증은 [사전 확인](../../../vpc_endpoint/agentcore-memory-static-ip/docs/7-terraform-setup.md#환경변수와-사전-확인)과 plan으로 확인해요. 장시간 갱신은 별도 실행 관찰이 필요해요.
- 로컬 CRL 검사 성공이 AWS의 CRL 배포·정책 전파 검증을 대신하지 않아요.
- SDK 갱신 테스트는 테스트용 provider 만료 시각을 조절해 helper 재실행을 확인해요. 운영 코드는 같은 조작을 하지 않아요.
- 다른 CPU/OS의 helper checksum도 설치 코드에 있지만 현재 로컬 실행 검증은 macOS arm64에 한정돼요.
- 실제 AWS 성공 판정은 [실험별 기준](3-experiments.md)을 따라요.

## 검증 실행

Python의 인증서·갱신·정리 동작을 확인해요.

```bash
python -m ruff check .
python -m pytest -q
```

Terraform 구성을 확인해요.

```bash
terraform -chdir=terraform fmt -check
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
terraform -chdir=terraform test
```

## 문제 해결

AWS에 연결하기 전에 인증서와 개인 키로 서명할 수 있는지 검사해요.

```bash
runtime/bin/aws_signing_helper sign-string \
  --certificate runtime/pki/clients/v1/client.crt \
  --private-key runtime/pki/clients/v1/client.key > /dev/null
```

- 확인한 1.8.5에서 파일 키를 사용할 때는 `--certificate`도 필요했어요.
- 종료 코드 0은 로컬 서명이 성공했다는 뜻이에요. AWS의 trust·권한 검증 결과는 아니에요.

| 증상 | 먼저 확인할 것 |
| --- | --- |
| python -m scripts.create_certificates 실행 시 기존 디렉터리 오류 | 발급 DB 덮어쓰기 방지 동작. 기존 실습 정리 여부 확인 |
| helper 실행 파일 없음 | python -m scripts.install_helper, SIGNING_HELPER의 경로와 실행 권한 |
| helper 다운로드 checksum 불일치 | 공식 버전·OS·CPU·checksum. 검증을 끄지 않음 |
| CredentialRetrievalError | helper의 오류 유형, 인증서·키·ARN·네트워크 |
| 인증서·개인 키 불일치 | 같은 v1 또는 v2 디렉터리의 파일을 함께 선택했는지 |
| CreateSession AccessDenied | trust anchor/profile 활성, Role trust의 ARN·계정·CN |
| 인증서 거부 | 체인·유효기간·Digital Signature·활성 CRL |
| TLS/DNS/timeout 오류 | 서울 endpoint·CA trust·방화벽·프록시 정책 |
| Memory AccessDenied | 자격증명 발급 이후 권한 문제. Memory ARN·Role 정책·SCP·boundary |
| 인증서 교체 후에도 이전 신원 사용 | 기존 세션 캐시와 다음 갱신 시 실제 helper 파일 선택 |
| python -m scripts.import_crl 중복 오류 | 기존 lab CRL 확인 후 python -m scripts.update_crl |
| CRL 반영 전후 결과가 같음 | 활성 CRL·trust anchor·serial·전파 지연, 새 프로세스의 CreateSession인지 |
| client.key Permission denied | 현재 로컬 사용자와 개인 키 파일 소유자·0600 권한 |
| CRL 삭제 또는 terraform destroy 실패 | A·B에서 선택한 관리 인증과 Roles Anywhere ListCrls/DeleteCrl 권한. B의 키 Expiration 확인 |

- helper를 직접 실행해 출력된 임시 키를 문서나 로그에 붙이지 않아요.
- 다른 인증서를 시험할 때는 `RA_CERTIFICATE`와 `RA_PRIVATE_KEY`를 함께 지정해요.
- 실습과 관계없는 설정이 남았다면 [환경 준비](2-setup.md#up)의 초기화부터 확인해요.
