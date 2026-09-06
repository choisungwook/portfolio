# S01 환경 준비와 정리

## Up

- 실행 위치: 네트워크 workspace 루트.
- Python·도구·자격증명: [공통 환경 준비](5-common-setup.md). `uv venv`로 만든 가상환경을 활성화해요.
- default VPC와 인터넷 게이트웨이로 라우팅되는 default subnet 필요.
- 관리 주체 권한: EC2 endpoint·EIP·보안 그룹, ELBv2, IAM Role·정책, Route 53 레코드, AgentCore Memory 생성·조회·삭제.
- 시작 주체의 `sts:AssumeRole` 권한은 그 주체가 이미 가진 정책에 의존해요. 같은 계정의 admin Role이면 별도 허용이 필요 없어요. SCP·permission boundary의 제한도 적용돼요.
- 비용 항목: NLB 시간·처리량, interface endpoint 시간·처리량, 공인 IPv4, Memory 사용량.

- [Terraform 관리 인증](7-terraform-setup.md)에서 옵션 A·B 중 1개로 인증한 뒤 진행해요.

계정 ARN이 들어가는 입력값은 Git에서 제외된 `terraform/terraform.tfvars`에 적어요. 이 저장소는 공개이므로 문서·예제 파일에 실제 계정 번호를 쓰지 않아요.

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

`terraform/terraform.tfvars`의 내용이에요. ARN은 아래 절차로 확인한 값으로 바꿔요.

```hcl
allowed_client_cidrs  = ["0.0.0.0/0"]
availability_zones    = ["ap-northeast-2a"]
trusted_principal_arn = "arn:aws:iam::123456789012:role/<admin 프로파일의 Role>"
```

- `allowed_client_cidrs`: 기본 `["0.0.0.0/0"]`. public NLB의 TCP 443을 모든 IPv4 클라이언트에 허용해요.
- `trusted_principal_arn`: 클라이언트 프로파일의 IAM 사용자·Role ARN. 아래 절차로 확인해요.
- 배포용 Role은 A의 `admin.role_arn` 또는 B의 `TERRAFORM_ROLE_ARN`에서 지정해요. 클라이언트용 IAM 리소스와 별개예요.
- `availability_zones`: 기본 `ap-northeast-2a`. 두 endpoint 서비스가 모두 지원하는 AZ 선택.
- endpoint SG는 NLB에서 오는 TCP 443만 허용해요. [전체 SG 범위](5-common-setup.md#보안-그룹의-공개-범위)를 확인해요.

배포 Role로 서울 endpoint 서비스와 지원 AZ를 조회한 뒤 Terraform 계획을 확인해요.

```bash
python scripts/check_services.py
terraform -chdir=terraform init
terraform -chdir=terraform plan
```

계획을 확인한 뒤 리소스를 배포하고 공개 실행 설정을 내보내요.

```bash
terraform -chdir=terraform apply
mkdir -p runtime
terraform -chdir=terraform output -json client_config | jq . > runtime/config.json.tmp &&
  mv runtime/config.json.tmp runtime/config.json
```

- `runtime/config.json`: 시작 주체 ARN·Memory ID·Role ARN·endpoint ID·NLB DNS·EIP 저장. 항목 설명과 예제는 [runtime 설정 파일](8-runtime-config.md)에 있어요.
- 자격증명은 runtime 파일에도 Terraform output에도 없어요. 클라이언트는 AWS 프로파일로 인증해요.
- 출력 명령이 성공했을 때만 기존 JSON을 교체해요.
- NLB target이 `healthy`가 될 때까지 확인해요.

STS와 Memory target의 상태를 조회해요.

```bash
jq -r '.services[].target_group_arn' runtime/config.json |
while IFS= read -r target; do
  aws elbv2 describe-target-health --region ap-northeast-2 --target-group-arn "$target"
done
```

실제 outbound 방화벽에 등록할 모든 AZ의 EIP를 출력해요.

```bash
terraform -chdir=terraform output -json firewall_destination_ips
```

- 목적지 EIP마다 `/32`, TCP 443을 허용해요. 일반 DNS 질의 경로는 유지해요.
- Python 스크립트는 로컬 방화벽을 설정하거나 차단을 강제하지 않아요.

### 클라이언트 프로파일과 시작 주체

- 클라이언트는 로컬 AWS 프로파일로 시작해요. Terraform은 IAM 사용자나 액세스 키를 만들지 않고, output에 비밀을 내보내지 않아요.
- 이 PoC는 배포용 admin 프로파일을 클라이언트 시작에도 그대로 써요. `trusted_principal_arn`에는 admin 프로파일의 Role ARN이 들어가요. 배포 주체와 실험 주체를 나누려면 별도 프로파일의 ARN을 넣으면 돼요.
- trust는 apply 때 쓰이지 않아요. Python이 NLB를 거쳐 STS에 AssumeRole 할 때 client Role의 trust policy가 이 ARN을 확인해요.
- 관리 터미널에서 Terraform을 실행할 때는 hosts 실습 블록을 빼요. 넣은 채로 실행하면 관리 STS 호출도 NLB 경로를 타요.
- `trusted_principal_arn`: 클라이언트 프로파일 뒤에 있는 기존 IAM 사용자·Role ARN. client Role trust가 이 값을 참조해요.
- STS endpoint policy는 PoC라서 전체 허용이에요. hosts를 바꾼 컴퓨터에서는 admin 프로파일의 체인 AssumeRole과 Terraform의 STS 호출까지 이 endpoint를 지나므로, 좁히면 관리 경로가 같이 막혀요. 실무용 제한 정책은 `terraform/vpc_endpoint.tf`의 주석 예시를 참고해요.
- 발급 대상: `aws_iam_role.client`, 기본 이름 `memory-static-ip-client`. Memory 권한은 이 Role에만 있어요.
- 프로파일이 Role(예: admin)이면 Role → Role의 chaining이라 세션은 최대 1시간이에요. 코드는 15분을 요청해요.
- [IAM Principal](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html)은 존재하는 사용자·Role을 지정해야 해요. 예제 ARN을 그대로 입력하면 Invalid principal 오류가 발생해요.

클라이언트 프로파일의 주체 ARN을 확인해 `terraform.tfvars`의 `trusted_principal_arn`에 적어요. Role 프로파일이면 `assumed-role/<이름>/...` 세션 ARN이 아니라 `role/<이름>` ARN을 넣어요.

```bash
aws sts get-caller-identity --profile admin --query Arn --output text
```

- `terraform.tfvars`는 `.gitignore`에 있어요. 커밋 전 `git status`로 추적되지 않는지 확인해요.

별도 클라이언트 터미널에서 workspace로 이동하고 가상환경과 프로파일을 지정해요. 환경변수 키가 남아 있으면 코드가 중단해요.

```bash
source .venv/bin/activate
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
export AWS_PROFILE=admin
aws sts get-caller-identity --query Arn --output text
```

선택한 AZ의 hosts 항목을 파일로 준비해요.

```bash
python -m scripts.public_nlb_hosts runtime/config.json --az ap-northeast-2a > runtime/hosts.entries
```

- [로컬 /etc/hosts 설정](6-hosts-setup.md#up)에 따라 백업·실습 블록 추가·캐시 초기화·Python 이름 조회 확인을 수행해요.
- [S01 실험](scenarios/s01/2-experiment.md#실험)에서도 같은 `--az`를 사용해요.
- 다중 AZ 검증은 기존 실습 hosts 블록을 제거하고, 다른 AZ 항목을 생성·적용한 뒤 반복해요.

## Down

- 실험 성공·실패와 관계없이 [hosts 원복](6-hosts-setup.md#down)을 먼저 수행해요.
- BEGIN·END와 실습 두 줄을 제거하고, 기존 항목 및 DNS 캐시를 복구해요.
- 배포 때 사용한 관리용 터미널과 같은 `terraform.tfvars`로 리소스를 삭제해요. 새 터미널에서는 [관리 인증](7-terraform-setup.md)을 다시 설정해요.

Terraform destroy 성공 후 S01의 실행 설정을 정리해요.

```bash
terraform -chdir=terraform destroy &&
  rm -f runtime/config.json runtime/config.json.tmp
```

- destroy에 실패하면 runtime 파일을 유지하고 원인을 해결해요.
- Memory와 그 안에 남은 실험 데이터도 삭제돼요.
- client Role과 S05 alias 레코드도 삭제돼요. default VPC와 기존 프로파일의 사용자/Role은 유지돼요.
- NLB·endpoint·EIP가 모두 삭제됐는지 destroy 결과에서 확인해요.

클라이언트 셸의 프로파일 지정을 지우고 가상환경을 종료해요.

```bash
unset AWS_PROFILE
deactivate
```
