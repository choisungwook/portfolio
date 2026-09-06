# IAM Roles Anywhere 30분 핸즈온

AWS 자격증명이 전혀 없는 워크로드가 **사설 CA가 발급한 X.509 인증서**로 IAM Role의 임시 자격증명을 받고, 그 키로 AgentCore Memory를 호출해요. 인증서 교체와 폐기(CRL)까지 실제 AWS에서 확인했어요(2026-09-06).

## 결론 먼저

- 클라이언트에는 Leaf 인증서와 개인 키만 있어요. AWS 장기 키도, STS 호출도 없어요.
- AWS는 검증을 위해 밖으로 나가지 않아요. IdP inbound를 열어야 하는 OIDC와 달리 폐쇄망 CA로 성립해요.
- CA를 신뢰하는 것과 인증서를 허용하는 것은 달라요. Role trust의 CN 조건이 두 번째 관문이에요.
- 폐기는 CRL 업로드가 곧 채널이에요. AWS는 CDP·OCSP를 조회하지 않아요.

## 순서

| | 문서 | 시간 |
| --- | --- | --- |
| 개념 | [원리 · OIDC 비교 · 구성 요소 · 운영 · Revoke · 네트워크](docs/1-concept.md) | 10분 읽기 |
| 실습 | [준비 → CA → Terraform → 인증 → CN 거부 → 교체 → 폐기 → 정리](docs/2-handson.md) | 20분 |
| 결과 | [실제 실행 결과와 문제 해결](docs/3-validation.md) | |

## 빠른 실행

```bash
cd aws/iam/roles-anywhere
uv venv && source .venv/bin/activate && uv sync --frozen
export AWS_PROFILE=admin
python install_helper.py
python pki.py init
terraform -chdir=terraform init && terraform -chdir=terraform apply
terraform -chdir=terraform output -json lab | jq . > runtime/lab.json
python run.py                                  # PASS
python pki.py issue v2 && python pki.py revoke v1 && python crl_aws.py import
RA_CERTIFICATE=$PWD/runtime/pki/clients/v1/client.crt RA_PRIVATE_KEY=$PWD/runtime/pki/clients/v1/client.key python run.py   # Certificate revoked
python crl_aws.py delete && terraform -chdir=terraform destroy && rm -rf runtime/lab.json runtime/pki
```

## 저장소 구성

| 파일 | 역할 |
| --- | --- |
| `pki.py` | 사설 CA 생성, Leaf 발급, 폐기, CRL 생성 (OpenSSL) |
| `run.py` | helper를 credential_process로 연결한 boto3 → Memory 왕복 |
| `crl_aws.py` | CRL을 trust anchor에 import / update / delete |
| `install_helper.py` | 공식 aws_signing_helper 1.8.5 다운로드·SHA256 검증 |
| `terraform/` | trust anchor, profile, IAM Role·정책, Memory |
| `runtime/` | git 제외. CA·개인 키·helper·lab.json |
| `examples/lab.json.example` | runtime/lab.json 자리표시 예제 |
| `imgs/` | 흐름·구성 요소 그림과 Mermaid 원본 |
| `tests/` | `python -m pytest -q` |
| `knowledge/` | 설계 결정. 고치기 전에 [index](knowledge/index.md) |

## 관련

- [NLB 고정 IP로 AWS API를 호출한 공개 사례](docs/usecase.md)
- [public NLB 고정 IP 네트워크 실습](../../vpc_endpoint/agentcore-memory-static-ip/README.md)
- [Terraform 관리 인증 A·B](../../vpc_endpoint/agentcore-memory-static-ip/docs/7-terraform-setup.md)
