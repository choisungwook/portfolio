# 시나리오 공통 준비

## Up

- 실행 위치: 이 workspace 루트.
- 도구: Terraform 1.11 이상, uv, AWS CLI v2, jq. S05·S07의 DNS 확인에는 dig, S02에는 Docker와 openssl도 사용해요.
- 클라이언트: 인터넷으로 NLB EIP에 TCP 443 연결이 가능한 컴퓨터.
- 관리 PC의 AWS 로그인·리소스 생성 경로는 제한된 클라이언트 실행 경로와 분리해요.
- [Terraform 관리 인증](7-terraform-setup.md)에서 옵션 A·B 중 1개로 인증한 뒤 진행해요.
- 관리 주체 권한: EC2·ELB·IAM·AgentCore 리소스 관리와 Route 53 레코드 변경. S07은 ACM 조회·iam:PassRole도 필요해요.
- 한 번에 하나의 시나리오를 실행하고 시나리오별 Terraform state를 유지해요.

처음 한 번 workspace 전용 가상환경을 만들고 의존성을 설치해요.

```bash
uv venv
source .venv/bin/activate
uv sync --frozen
```

- 새 터미널에서는 workspace에서 `source .venv/bin/activate`를 다시 실행해요. 이후 문서의 `python`은 이 가상환경의 Python이에요.
- Python 코드는 OS 방화벽을 변경하지 않아요. 고정 IP 경로의 호출 성공과 실제 outbound 차단 검증을 구분해요.
- 방화벽 제약까지 검증하려면 해당 환경에 목적지 허용 목록을 적용하고 직접 AWS public IP 연결 차단과 NLB 경유 로그를 확인해요.
- S01은 [로컬 /etc/hosts 설정과 원복](6-hosts-setup.md)을 수행해요. S05·S07로 전환하기 전에 실습 hosts 항목을 제거해요.
- 일반 DNS 질의 경로는 유지해요. DNS 변경 불가 시나리오에서 AWS 도메인을 hosts로 덮어쓰지 않아요.
- 비용: endpoint·NLB·공인 IPv4·Memory. S07은 EC2/EBS 추가.

## STS 준비

- S01·S07 모두 클라이언트는 로컬 AWS 프로파일로 시작하고, 그 주체의 ARN을 `trusted_principal_arn`에 넣어요. Terraform은 키를 만들거나 출력하지 않아요. [S01 프로파일 준비](2-setup.md#클라이언트-프로파일과-시작-주체)를 따라요.
- S07은 원본 주체의 권한과 실습 Role의 trust policy가 AssumeRole을 허용하는지 확인해요. 이 Terraform은 원본 주체의 IAM 정책을 수정하지 않아요.

### trusted_principal_arn의 목적

| 값 | 의미 |
| --- | --- |
| A의 AWS_PROFILE=admin / B의 TERRAFORM_ROLE_ARN | Terraform 배포용 Role 선택 |
| terraform.tfvars의 trusted_principal_arn | 클라이언트 AWS_PROFILE 뒤의 기존 IAM 사용자·Role |
| runtime JSON의 role_arn | Terraform이 생성한 실습 Role. AssumeRole의 대상 |
| 반환된 임시 자격증명 | 실습 Role의 권한으로 Memory를 호출할 때 사용 |

- 흐름: 시작 자격증명 → STS AssumeRole → 실습 Role의 임시 자격증명 → Memory.
- trust policy는 누가 Role을 받을 수 있는지 정해요. Memory 권한은 별도의 실습 Role 권한 정책으로 제한해요. [AWS AssumeRole 설명](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)

### 시작 주체 ARN 확인

클라이언트용 AWS 프로파일로 현재 주체를 조회해요.

```bash
aws sts get-caller-identity --profile your-client-profile \
  --region ap-northeast-2 --query Arn --output text
```

| 조회 결과 형식 | trusted_principal_arn에 넣을 값 |
| --- | --- |
| arn:aws:iam::123456789012:user/lab-client | 조회된 IAM 사용자 ARN 그대로 |
| arn:aws:sts::123456789012:assumed-role/ExistingClientRole/session-name | 원본 IAM Role의 전체 ARN을 `aws iam get-role`로 별도 조회 |

- 이 실습의 변수는 `arn:aws:sts::...:assumed-role/...` 세션 ARN을 받지 않아요. [IAM Role과 세션 Principal](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html)

클라이언트용 별도 터미널에서 프로파일만 지정해요. 키를 환경변수로 복사하지 않아요.

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_PROFILE=your-client-profile
```

## 보안 그룹의 공개 범위

| 경로 | 기본 허용 |
| --- | --- |
| S01 public NLB 진입 | 0.0.0.0/0 → TCP 443 |
| S07 public NLB 진입 | 0.0.0.0/0 → TCP 443 |
| S01 NLB → endpoint | NLB SG → endpoint SG, TCP 443 |
| S07 NLB → EC2 프록시 | NLB SG → 프록시 SG, TCP 8080 |
| S07 프록시 → endpoint | 프록시 SG → endpoint SG, TCP 443 |

- 인터넷에서 NLB에 연결할 수 있어도 IAM 인증은 적용돼요. Memory endpoint 정책은 client Role로 제한하고, STS endpoint 정책은 PoC라서 모든 주체의 sts:*를 허용해요.
- S07 프록시는 STS·Memory 호스트의 CONNECT만 처리해요. 외부 연결 자체에는 별도 프록시 인증이 없어요.
- 클라이언트의 outbound 목적지 IP 제한은 별도 조건이에요. AWS 쪽 NLB 진입을 공개해도 이 실험 조건은 유지돼요.

## 프록시 준비 (S07)

- 기존 **public Route 53 hosted zone**과 **서울 ACM 인증서**가 필요해요.
- 프록시 이름을 `terraform/labs/s07/terraform.tfvars`의 `proxy_domain`에 적어요. 권한 DNS가 Route 53이면 `route53_zone_id`도 적고, 아니면 null로 두고 그 사업자에 A 레코드를 직접 추가해요. 문서 예제는 `example.com`이에요.
- 레코드는 인터넷에서 권한이 있는 DNS에 있어야 해요. 등록기관의 네임서버가 가리키는 사업자가 권한 DNS예요. `whois <도메인>`의 Name Server와 `dig +short NS <도메인>`이 같은 곳을 가리키는지 확인하고, 그곳에 레코드를 넣어요. Route 53에 zone과 레코드가 있어도 등록기관 NS가 다른 곳이면 조회되지 않아요.
- `acm_certificate_arn`은 이 이름을 인증하는 `ISSUED` 상태의 `ap-northeast-2` 인증서 ARN이어야 해요. 와일드카드(`*.example.com`)면 돼요. DNS 검증 CNAME도 권한 DNS에 넣어야 통과해요. `aws acm describe-certificate`의 `ResourceRecord`가 넣을 값이에요. `FAILED`·`PENDING_VALIDATION` 인증서는 NLB listener에 붙일 수 없어요.
- EC2 프록시에는 공인 IP를 할당하지 않아요. AL2023의 Python 3와 systemd로 실행해요.
- 프록시는 요청한 AWS 호스트를 허용 목록에서 찾고, 서버 쪽에서 VPCE DNS로 연결해요.
- 라우팅 파일·프록시 코드가 바뀌면 Terraform이 EC2를 교체해요. 실습용 단일 인스턴스예요.

## Down

- 먼저 [hosts 원복](6-hosts-setup.md#down)을 수행한 뒤 각 시나리오의 `terraform destroy`로 해당 리소스를 삭제해요.
- 마지막으로 `deactivate`로 가상환경을 종료해요.
