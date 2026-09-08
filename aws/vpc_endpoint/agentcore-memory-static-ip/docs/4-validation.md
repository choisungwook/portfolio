# 검증 상태와 문제 해결

## 확인 범위

| 항목 | 상태 |
| --- | --- |
| AWS 공식 문서의 STS·Memory 서울/PrivateLink 지원 | 확인 |
| Terraform validate | S01·S07 root 통과 |
| Terraform 관리 인증 A·B | S01의 실제 AWS provider + 모의 CLI·STS로 A의 credential_process → AssumeRole, B의 환경변수 키 사용과 서울 서명 확인 |
| B의 STS 실패 처리 | Bash·Zsh에서 CLI 실패·토큰 누락 시 부분 키·이전 키가 남지 않는지 확인 |
| 실제 AWS 관리 인증·로그인 갱신 | 2026-09-06 확인. default(login_session)를 직접 쓰면 짧게 만료됐고, AWS_PROFILE=admin(base credential_process → AssumeRole)은 1시간 세션과 갱신으로 Terraform·CLI·destroy까지 안정적 |
| Python 테스트 | 35개 통과 |
| Terraform 최초 plan·입력 제약 모의 테스트 | S01 9개 + S07 1개 통과. 기존 주체 ARN 참조·세션 ARN 거부·비밀 output 없음, 공개 CIDR·backend 경계, S06 기본 비활성·TLS listener/target group·인증서 없는 도메인 거부 확인 |
| 로컬 CONNECT 터널 | 실제 socket·TLS 서버로 SNI·Host·Authorization 유지, 허용 외 목적지 거부 확인 |
| boto3 HTTPS proxy | 바깥 proxy TLS와 안쪽 AWS 모의 TLS 검증, 서울 SigV4·세션 토큰 전달 확인 |
| S05 TLS 이름 불일치 | 2026-09-06 실제 확인. 공개 DNS로 alias가 STS NLB EIP로 해석된 상태에서 EXPECTED_FAILURE TLS hostname mismatch 출력 |
| 로컬 /etc/hosts 변경 | 2026-09-06 수동 수행. OS 방화벽 차단은 미실행 |
| 실제 AWS S01 apply·NLB target health | 2026-09-06 완료. STS·Memory target healthy, S05 alias 레코드 생성 |
| 실제 S02 Squid 컨테이너 경유 STS·Memory 왕복 호출 | 2026-09-06 PASS. 로컬 DNS 그대로, 컨테이너 /etc/hosts로 EIP 매핑, access.log에 TCP_TUNNEL/200 … HIER_DIRECT/EIP 확인. 전역 HTTPS_PROXY는 로그인 갱신 호출이 403으로 막혀 클라이언트 Config로 한정 |
| 실제 S01 hosts 실험·STS·Memory 왕복 호출 | 2026-09-06 PASS. AZ 2a, admin 프로파일, DNS·TLS·AssumeRole·CallerIdentity·Create/Get/Delete 전부 EIP 경로로 통과 |
| S06 자체 도메인 TLS 재암호화 직결 | **미실행**. 2026-09-08 Terraform validate·mock test와 Python 테스트만 통과. 실제 AWS에서 `python -m scenarios.s06_own_domain_tls_nlb`를 돌린 뒤 PASS/REJECTED와 code를 이 행에 기록 |
| S07 실제 NLB TLS·프록시 EC2 | 2026-09-06 PASS. hosts 변경 없이 ACM 바깥 TLS → EC2 CONNECT proxy → STS·Memory VPCE로 STS_CREDENTIALS_OK·Create/Get/Delete 통과. 자격증명 장시간 갱신은 미실행 |

- 문서상 가능한 설계와 실제 AWS 검증 완료를 구분해요.
- 모의 테스트는 AWS의 실제 인증서·endpoint 정책·가용 AZ 동작을 대신 검증하지 않아요.
- provider의 HTTP 검증은 임시 AWS config·모의 CLI·가짜 키를 사용해요. `aws login`·CLI의 로그인 캐시 갱신·AWS trust policy·배포 권한·장시간 갱신은 검증 범위에 포함하지 않아요.
- 실제 관리 인증은 [사전 확인](7-terraform-setup.md#환경변수와-사전-확인)과 해당 시나리오의 plan으로 확인해요. 장시간 갱신은 별도 실행 관찰이 필요해요.
- 로컬 Python 실행은 DNS·TLS·AWS API 경로를 확인해요. 실제 outbound 차단은 해당 환경의 방화벽 정책·로그로 별도 확인해요.
- 실제 성공 여부는 [시나리오별 실험](../README.md)의 마지막 PASS와 방화벽 로그까지 확인해요.
- S05는 실제 AWS 인증서로 hostname mismatch(OpenSSL verify code 62)를 확인했어요. AWS가 알 수 없는 SNI에 기본 인증서를 내주는지, 연결을 끊는지는 구분하지 않았어요. 어느 쪽이든 클라이언트 검증은 실패해요.
- 온프레미스 방화벽은 Terraform이 생성하지 않아요.

## 로컬 검증

- [공통 환경 준비](5-common-setup.md#up)의 uv 가상환경을 활성화한 상태에서 실행해요.

Python 모델·SigV4 요청·credential_process·TLS 터널·DNS 검증·실패 시 정리를 확인해요.

```bash
python -m ruff check .
python -m pytest -q
```

Terraform 설정과 mock plan을 검증해요.

```bash
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
terraform -chdir=terraform test
terraform -chdir=terraform/labs/s07 init -backend=false
terraform -chdir=terraform/labs/s07 validate
terraform -chdir=terraform/labs/s07 test
```

- Terraform 테스트는 mock provider를 사용해 실제 리소스를 만들지 않아요.
- S01의 mock apply는 생성된 사용자를 trust·STS endpoint가 참조하는지, 키가 그 사용자에 속하는지, 공개 runtime 설정과 민감 output이 분리되는지 확인해요.
- 최초 plan에서 아직 생성되지 않은 ENI ID로 인해 `for_each` 키가 결정되지 않는 문제를 검증해요.
- Terraform init은 root별로 순서대로 실행해요. 공유 plugin cache를 사용하는 동시 init은 잠금 파일 checksum 충돌을 일으킬 수 있어요.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| AWS 세션 만료 | 관리 PC에서 해당 프로파일 로그인 갱신 |
| no VPC endpoint policy allows sts:... | STS endpoint policy를 좁혔을 때 hosts 블록이 걸린 컴퓨터의 관리 STS 호출·admin 체인 AssumeRole이 NLB → STS VPCE로 들어가 거부된 것. PoC는 Principal *·sts:* 허용, 좁히려면 hosts를 빼고 관리 명령 실행 |
| Terraform 관리 인증 실패 | A의 default → base → admin 설정 또는 B의 STS 키 적재·Expiration, Role trust·배포 권한. [관리 인증](7-terraform-setup.md) 확인 |
| TF_VAR 값을 바꿔도 이전 값 사용 | terraform.tfvars·auto.tfvars·저장된 plan의 입력값 우선순위 |
| aws login OAuth 갱신 실패 | aws login --profile default 재실행. A의 다음 자동 갱신과 B의 STS 재발급 모두 원본 로그인에 의존 |
| Invalid principal | trusted_principal_arn에 예제 ARN이나 세션 ARN을 넣은 오류. 실존 IAM 사용자·Role ARN 사용 |
| S01 클라이언트의 AssumeRole AccessDenied | AWS_PROFILE 주체가 trusted_principal_arn과 같은지, 그 주체에 sts:AssumeRole 권한이 있는지 확인 |
| Unset AWS_ACCESS_KEY_ID | 클라이언트는 프로파일만 사용. 남은 환경변수 키 제거 |
| default subnet 없음 | 서울 default VPC/subnet과 IGW 기본 경로 |
| endpoint service 또는 AZ 미지원 | `python scripts/check_services.py`의 교집합 AZ |
| NLB unhealthy | endpoint SG의 NLB SG 참조, TCP 443, ENI IP, client IP preservation 비활성화 |
| DNS mismatch | /etc/hosts 실습 블록·DNS 캐시·선택 AZ와 runtime EIP가 일치하는지 |
| TLS hostname mismatch | endpoint_url을 NLB·사용자 도메인으로 바꾸지 않았는지. S06이면 ACM SAN에 그 이름이 있는지, DNS가 TLS NLB(tls_eips)를 가리키는지 |
| S06 REJECTED SignatureDoesNotMatch·InvalidClientTokenId·IncompleteSignature | AWS가 우리 Host를 자기 요청으로 받지 않은 것. 구성 오류가 아니라 실험 결과. [결과 읽는 법](scenarios/s06/2-experiment.md#결과-읽는-법) |
| S06 FAIL ConnectionClosedError | NLB→endpoint 안쪽 TLS가 안 열린 가능성. S01 EIP로 `openssl s_client -noservername` 확인, TLS target health |
| TCP/TLS timeout | 현재 클라이언트 공인 IP, NLB ingress, 회사 outbound, target health |
| AssumeRole AccessDenied | 기존 주체 권한·Role trust·SCP·boundary. STS endpoint 정책을 좁혔다면 그 Principal도 확인 |
| Memory AccessDenied | 임시 토큰, Memory ARN, Memory endpoint 정책, aws:SourceVpce |
| SignatureDoesNotMatch | Host/SNI 변경, 서울 서명 리전, 시스템 시각 |
| Memory 조회·삭제 실패 | 이벤트 ID·actor/session ID, API 전파 지연·서비스 오류, 원래 이벤트의 잔존 여부 |
| 프록시 TLS 실패 | proxy_domain과 ACM SAN 일치, ISSUED 상태의 서울 인증서, 클라이언트 CA 신뢰 |
| 프록시 403 / 502 | 허용된 host:443인지 / EC2에서 VPCE DNS·443 연결 가능한지 |
| 프록시 NLB unhealthy | EC2 cloud-init·aws-connect-proxy systemd·8080, NLB/EC2 SG 참조 |

- NLB TCP health check는 TLS 인증과 AWS 권한을 확인하지 않아요.
- Role 정책이나 endpoint 정책 변경 직후에는 전파 시간을 두고 재시도해요.
- Memory 이벤트는 읽기 실패 시에도 삭제를 시도해요. 프로세스 강제 종료나 삭제 API 실패로 남은 이벤트는 7일 만료 또는 Memory 삭제로 정리돼요.
