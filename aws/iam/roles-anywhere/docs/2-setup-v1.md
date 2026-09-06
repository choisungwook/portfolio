# 환경 준비와 정리

## Up

- 실행 위치: `aws/iam/roles-anywhere`.
- 도구: Terraform 1.11 이상, uv, AWS CLI v2, OpenSSL.
- 지원 실행 환경: macOS/Linux의 arm64 또는 x86_64.
- 관리 PC에는 IAM·Roles Anywhere·AgentCore Memory 리소스 관리 권한이 필요해요.
- CRL 실험에는 ListCrls·ImportCrl·UpdateCrl·DeleteCrl 권한도 필요해요.
- client는 Leaf 인증서·개인 키로 인증해요. AWS 장기 키나 관리 프로파일을 인증에 사용하지 않아요.
- client 네트워크는 `rolesanywhere.ap-northeast-2.amazonaws.com`과 `bedrock-agentcore.ap-northeast-2.amazonaws.com`의 HTTPS 접속이 가능해야 해요.
- 이 독립 실습은 public endpoint를 직접 호출해요. 앞서 NLB 실습을 했다면 [hosts 원복](../../../vpc_endpoint/agentcore-memory-static-ip/docs/6-hosts-setup.md#down)을 먼저 수행해요.
- 인증서·helper 다운로드와 Terraform 관리 API는 준비 단계의 별도 통신이에요.
- 과금 대상: Memory 저장·API 사용. NLB·VPN·VPC endpoint·EC2·AWS Private CA는 이 기본 환경에 생성하지 않아요.

- [Terraform 관리 인증](../../../vpc_endpoint/agentcore-memory-static-ip/docs/7-terraform-setup.md)에서 옵션 A·B 중 1개로 인증한 뒤 진행해요.

처음 한 번 workspace 전용 가상환경을 만들어요.

```bash
unset LAB_CONFIG RA_CERTIFICATE RA_PRIVATE_KEY SIGNING_HELPER
uv venv
source .venv/bin/activate
uv sync --frozen
```

- 다른 실습의 인증서·설정 경로가 남지 않도록 위 환경변수 4개를 초기화해요.
- 새 터미널에서는 workspace에서 `source .venv/bin/activate`를 다시 실행해요.
- 아래 `python` 명령은 활성화한 가상환경에서 실행해요.
- Terraform과 CRL 관리 명령은 선택한 A·B 인증을 함께 사용해요. 관리용 터미널의 인증을 유지해요.
- 개인 키와 Terraform state는 커밋 대상에서 제외돼요.

새 실습 CA와 정상·거부용 인증서를 만들어요.

```bash
python -m scripts.create_certificates
```

| 생성 위치 | 내용 |
| --- | --- |
| runtime/pki/ca/ | CA 인증서·개인 키·발급 DB |
| runtime/pki/clients/v1/ | CN=memory-client, 정상 인증용 |
| runtime/pki/clients/denied/ | CN=other-client, 거부 실험용 |

- 디렉터리가 이미 있으면 덮어쓰지 않고 중단돼요.
- 파일 권한은 개인 키 0600, PKI 디렉터리 0700이에요.
- CA와 인증서는 실습용이에요. 기존 운영 CA를 이 위치에 복사하지 않아요.
- 기존 CA를 쓰려면 공개 CA 경로와 인증서 발급·체인 조건을 별도로 맞춰요.

관리용 터미널에서 Terraform 입력값을 환경변수로 지정하고 계획을 확인해요.

```bash
export TF_VAR_project_name='ra-handson'
export TF_VAR_ca_certificate_path="$PWD/runtime/pki/ca/ca.crt"
export TF_VAR_certificate_common_name='memory-client'
terraform -chdir=terraform init
terraform -chdir=terraform plan
```

- `project_name`: 리소스 이름 접두사. 다른 배포와 겹치지 않게 지정해요.
- `ca_certificate_path`: CA 공개 인증서 파일. 기본값은 생성 스크립트의 파일을 가리켜요.
- `certificate_common_name`: 정상 인증서 CN과 같아야 해요. 기본 `memory-client`.
- Terraform은 CA 공개 인증서만 읽어요. CA·Leaf 개인 키는 state에 넣지 않아요.

리소스를 배포하고 클라이언트 실행 설정을 내보내요.

```bash
terraform -chdir=terraform apply
mkdir -p runtime
terraform -chdir=terraform output -json lab > runtime/lab.json.tmp &&
  mv runtime/lab.json.tmp runtime/lab.json
```

- apply 계획을 확인한 뒤 Terraform의 승인 프롬프트에 응답해요.
- `runtime/lab.json`: 공개 ARN·Memory ID·프로젝트 설정. 임시 AWS 자격증명은 저장하지 않아요.
- 출력 명령이 성공했을 때만 기존 JSON을 교체해요.
- AWS 리소스는 정리 전까지 유지돼요.

로컬 OS에 맞는 공식 helper를 준비해요.

```bash
python -m scripts.install_helper
```

- [설치 코드](../scripts/install_helper.py)는 공식 helper 1.8.5를 내려받고 OS/CPU별 공개 SHA256과 비교해요.
- 설치 파일: `runtime/bin/aws_signing_helper`.
- 새 버전으로 바꿀 때는 [공식 다운로드 표](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/credential-helper.html)의 OS/CPU별 파일과 checksum을 함께 갱신해요.
- 관리·클라이언트 역할을 같은 PC에서 재현해요. 클라이언트 코드는 CA 개인 키를 읽지 않아요.
- 별도 클라이언트에는 Leaf 인증서·개인 키와 `lab.json`을 전달하고, 그 OS에 맞는 helper를 설치해요.

첫 Memory 실험을 로컬에서 실행해요.

```bash
python -m client.run
```

- [실험 문서](3-experiments.md)에서 정상 인증·CN 거부·인증서 교체·폐기·갱신을 이어서 확인해요.

## Down

- 배포 때 사용한 관리용 터미널과 `TF_VAR_*` 값을 유지해요. 새 터미널에서는 관리 인증과 위 입력값을 다시 설정해요.

배포 Role로 실습 CRL을 먼저 삭제하고 Terraform 리소스를 정리해요.

```bash
python -m scripts.delete_crl &&
  terraform -chdir=terraform destroy &&
  rm -f runtime/lab.json runtime/lab.json.tmp
```

- 해당 trust anchor와 실습 CRL 이름이 일치하는 CRL만 먼저 삭제해요.
- 그다음 Memory·Role·profile·trust anchor를 삭제해요.
- 실패하면 runtime 설정과 PKI 파일을 유지하고 원인을 해결해요.
- Terraform이 참조하는 CA 공개 인증서는 destroy가 끝날 때까지 유지해요. CA 개인 키·발급 DB도 인증서 실험과 정리가 끝날 때까지 보관해요.
- apply 도중 실패했다면 위 output 명령으로 `runtime/lab.json`을 내보낼 수 있는지 확인해요.
- CRL은 import/update 실험 단계에서만 생겨요. `lab.json`이 없고 CRL을 만든 적도 없다면 `terraform -chdir=terraform destroy`로 정리할 수 있어요.
- state 복구 없이 runtime을 먼저 삭제하지 않아요.

AWS 정리 성공 후 이 workspace가 만든 로컬 인증서와 helper를 삭제하고 가상환경을 종료해요.

```bash
rm -rf runtime
unset LAB_CONFIG RA_CERTIFICATE RA_PRIVATE_KEY SIGNING_HELPER
deactivate
```

- 운영 인증서 경로나 다른 실습 디렉터리에 이 정리 명령을 적용하지 않아요.
