# STS·AgentCore Memory 고정 IP 핸즈온

outbound 목적지 IP가 제한된 환경에서, AWS 도메인 이름은 그대로 두고 **우리가 소유한 NLB EIP**로만 STS와 AgentCore Memory를 호출할 수 있는지 확인하는 실습이에요. 2026-09-06에 아래 4개 시나리오를 실제 AWS에서 검증했어요.

## 결론 먼저

| 상황 | 쓸 시나리오 | 한 줄 이유 |
| --- | --- | --- |
| 클라이언트 DNS(hosts·사내 DNS)를 바꿀 수 있다 | **S01** | AWS 이름 유지, IP만 EIP. 앱 변경 0 |
| DNS는 못 바꾸고 앱이 프록시 설정을 받는다 | **S02** | 앱 네트워크의 Squid가 이름을 EIP로 해석. AWS 쪽은 S01 그대로 |
| "우리 도메인을 NLB에 붙이면 되지 않나?" | S05로 실패 확인 | AWS 인증서에 그 이름이 없어 TLS에서 끊김 |
| AWS 안에 프록시를 두는 구성 | S07 (비권장) | IAM이 있는데 프록시 인증 홉이 하나 더 생김 |

- 공통 원리: URL·TLS SNI·HTTP Host·SigV4 host 네 곳에 AWS 이름이 같이 들어가므로, **이름은 절대 바꾸지 않고 이름이 가리키는 IP만 바꾼다.**
- AWS 쪽 구성은 항상 같아요. 서비스별 public TCP NLB(EIP) → interface VPC endpoint → AWS 서비스. NLB는 TLS를 열지 않아요.

## 시나리오 인덱스

| 시나리오 | 클라이언트 쪽에서 바꾸는 것 | AWS 인프라 | 판정 | 문서 |
| --- | --- | --- | --- | --- |
| S01 hosts 변경 | `/etc/hosts` 두 줄 | `terraform/` | 가능 | [setup](docs/scenarios/s01/1-setup.md) · [실험](docs/scenarios/s01/2-experiment.md) · [코드 설명](docs/9-s01-code-walkthrough.md) |
| S02 앱 네트워크 Squid | 프록시 컨테이너 + 앱의 프록시 설정 | S01과 동일 | 가능, DNS 변경 불가 시 권장 | [setup](docs/scenarios/s02/1-setup.md) · [실험](docs/scenarios/s02/2-experiment.md) |
| S05 자체 도메인 | Route 53 alias 하나 (Terraform이 생성) | S01과 동일 | 예상 실패 | [setup](docs/scenarios/s05/1-setup.md) · [실험](docs/scenarios/s05/2-experiment.md) |
| S07 AWS 안 CONNECT proxy | 앱의 프록시 설정 | `terraform/labs/s07/` (별도 state) | 동작하지만 비권장 | [setup](docs/scenarios/s07/1-setup.md) · [실험](docs/scenarios/s07/2-experiment.md) |

## 몇 달 뒤에 다시 돌리는 순서

S01·S02·S05는 같은 인프라를 쓰므로 한 번 올려서 셋을 연달아 돌리고 내려요. S07은 별도 state라 따로 올리고 내려요.

### 0. 준비 (한 번)

```bash
cd aws/vpc_endpoint/agentcore-memory-static-ip
uv venv && source .venv/bin/activate && uv sync --frozen
export AWS_PROFILE=admin                              # 관리·실험 모두 이 프로파일. docs/7-terraform-setup.md
cp terraform/terraform.tfvars.example terraform/terraform.tfvars   # 실제 값 입력. git 제외 파일
```

- `terraform.tfvars`에 넣을 것: `trusted_principal_arn`(admin 프로파일의 Role ARN), `sts_alias_domain`, `route53_zone_id`. 설명은 [S01 준비](docs/2-setup.md#up).
- 도구: Terraform, uv, AWS CLI v2, jq, Docker(S02), openssl·dig.
- 로그인이 짧게 끊기면 `aws login --profile default` 뒤 계속 `AWS_PROFILE=admin`을 써요.

### 1. 인프라 올리기 (S01·S02·S05 공용)

```bash
grep -c amazonaws.com /etc/hosts                      # 0 이어야 함. 남아 있으면 docs/6-hosts-setup.md#down
terraform -chdir=terraform init
terraform -chdir=terraform apply
terraform -chdir=terraform output -json client_config | jq . > runtime/config.json
python -m scripts.public_nlb_hosts runtime/config.json --az ap-northeast-2a > runtime/hosts.entries
```

target 2개가 healthy가 될 때까지 기다려요. 명령은 [S01 준비](docs/2-setup.md#up)에 있어요.

### 2. S01: hosts 변경

```bash
cat runtime/hosts.entries                             # 이 두 줄을 sudoedit /etc/hosts 로 추가
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
python -m scenarios.s01_public_dns_sts --az ap-northeast-2a
sudoedit /etc/hosts                                   # 끝나면 두 줄 삭제 후 캐시 초기화
```

- 마지막 줄 `PASS STS AssumeRole -> AgentCore Memory through NLB EIPs`.
- hosts를 넣은 채로 Terraform·CLI를 실행하지 않아요. 관리 호출까지 NLB 경로를 타요.

### 3. S02: 앱 네트워크 Squid (hosts 원복 상태에서)

```bash
docker run -d --name aws-forward-proxy -p 127.0.0.1:3128:3128 \
  $(awk '{printf "--add-host %s:%s ", $2, $1}' runtime/hosts.entries) \
  -v "$PWD/proxy/squid.conf:/etc/squid/squid.conf:ro" ubuntu/squid:latest
export LAB_PROXY_URL=http://127.0.0.1:3128
python -m scenarios.s02_client_proxy_sts
docker exec aws-forward-proxy tail -5 /var/log/squid/access.log | awk '{print $4, $6, $7, $9}'
docker rm -f aws-forward-proxy
```

- 마지막 줄 `PASS client-side CONNECT proxy -> NLB EIPs -> STS / AgentCore Memory`.
- 로그의 `HIER_DIRECT/<IP>`가 EIP인지 봐요. 전역 `HTTPS_PROXY`는 쓰지 않아요. [이유](docs/scenarios/s02/2-experiment.md#애플리케이션-설정)

### 4. S05: 자체 도메인 실패 확인

```bash
export NLB_ENDPOINT_URL="$(terraform -chdir=terraform output -raw sts_alias_url)"
dig +short "${NLB_ENDPOINT_URL#https://}" A            # STS NLB EIP가 나와야 함. 안 나오면 zone 위임 문제
python -m scenarios.s05_nlb_endpoint_only
```

- 기대 출력 `EXPECTED_FAILURE TLS hostname mismatch; no credentials were sent`.
- 이름이 안 풀리면 [zone 위임 topic](knowledge/topics/demo-akbun-com-delegation.md).

### 5. 인프라 내리기

```bash
grep -c amazonaws.com /etc/hosts                      # 0 확인
terraform -chdir=terraform destroy && rm -f runtime/config.json runtime/hosts.entries
```

### S07 (선택, 비권장 참고용)

```bash
cp terraform/labs/s07/terraform.tfvars.example terraform/labs/s07/terraform.tfvars   # vpc·subnet·ACM ARN 등 입력
terraform -chdir=terraform/labs/s07 init && terraform -chdir=terraform/labs/s07 apply
terraform -chdir=terraform/labs/s07 output -json lab | jq . > runtime/s07.json
export LAB_CONFIG="$PWD/runtime/s07.json"
python -m scenarios.s07_public_proxy_sts
terraform -chdir=terraform/labs/s07 destroy && rm -f runtime/s07.json
```

- `ISSUED` 상태의 서울 ACM 와일드카드 인증서와 권한 있는 Route 53 zone이 필요해요. [S07 준비](docs/scenarios/s07/1-setup.md)

## 저장소 구성

| 경로 | 내용 |
| --- | --- |
| `scenarios/s0N_*.py` | 시나리오별 실행 코드. 서로 import하지 않는 자기완결 파일 |
| `terraform/` | S01·S02·S05 공용 인프라. `terraform.tfvars`는 git 제외 |
| `terraform/labs/s07/`, `terraform/modules/` | S07 전용 root와 모듈 |
| `proxy/squid.conf` | S02 Squid 설정. CONNECT 터널만 허용 |
| `proxy/connect_proxy.py` | S07 EC2에 배포되는 최소 CONNECT 프록시 |
| `scripts/` | endpoint 서비스·AZ 조회, hosts 두 줄 출력 |
| `runtime/` | Terraform output으로 만드는 실행 설정. git 제외. [설명과 예제](docs/8-runtime-config.md) |
| `examples/` | `runtime/` 파일의 자리표시 예제 |
| `imgs/` | 아키텍처·순서 그림 PNG와 Mermaid 원본 |
| `tests/` | `python -m pytest -q` |
| `knowledge/` | 설계 결정과 그 이유. 고치기 전에 [index](knowledge/index.md)를 읽어요 |

## 문서

- [요구사항 분류와 가능/불가능 판정](docs/0-requirements.md)
- [S01 설계 근거](docs/1-feasibility.md) · [S01 환경 준비 상세](docs/2-setup.md) · [S01 실행과 방화벽 검증 기준](docs/3-experiment.md) · [S01 코드 설명](docs/9-s01-code-walkthrough.md)
- [검증 상태와 문제 해결](docs/4-validation.md)
- [공통 환경 준비](docs/5-common-setup.md) · [로컬 /etc/hosts 설정과 원복](docs/6-hosts-setup.md) · [Terraform 인증 A·B](docs/7-terraform-setup.md) · [runtime 설정 파일과 예제](docs/8-runtime-config.md)
- [NLB 고정 IP 공개 사례](../../iam/roles-anywhere/docs/usecase.md) · [설계 지식](knowledge/index.md)

## 심화학습

- 사내 DNS 오버라이드: S02의 Squid 대신 사내 리졸버(BIND RPZ, Unbound, dnsmasq, Windows DNS)에서 AWS 이름 두 개만 EIP로 답하게 하는 구성. 앱·프록시 변경이 없어요.
- SNI 기반 L4 릴레이: 앱이 프록시 설정을 받지 못할 때 nginx stream `ssl_preread`나 HAProxy tcp로 SNI별 EIP로 넘기는 구성. DNAT가 필요해요.
- Site-to-Site VPN: NLB 없이 endpoint를 직접 호출해요. private DNS + 조건부 포워딩이면 앱 변경 0, 아니면 `endpoint_url`에 VPCE 전용 이름을 넣어요. 이번 PoC 범위에서 제외했어요.
- 인터넷 + public NLB + Roles Anywhere: S01에 `rolesanywhere` endpoint·NLB·EIP를 추가하고 인증서로 CreateSession을 호출하는 시나리오예요. 인증 원리는 [독립 Roles Anywhere 실습](../../iam/roles-anywhere/README.md)에서 먼저 확인해요.
