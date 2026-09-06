# S07 환경 준비와 정리

- 대상: public NLB·CONNECT 프록시·STS.
- 실행 위치: workspace 루트.
- 선행 준비: [공통 환경](../../5-common-setup.md).
- 인증 준비: [STS](../../5-common-setup.md#sts-준비).
- Terraform: [s07](../../../terraform/labs/s07/).

## Up

- [Terraform 관리 인증](../../7-terraform-setup.md)에서 옵션 A·B 중 1개로 인증한 뒤 진행해요.

시나리오 입력값을 관리용 터미널의 환경변수로 지정해요. VPC·subnet·ARN·사설 IP는 사용할 값으로 바꿔요.

```bash
export TF_VAR_project_name='memory-s07'
export TF_VAR_vpc_id='vpc-0123456789abcdef0'
export TF_VAR_subnets='{"ap-northeast-2a":"subnet-0123456789abcdef0"}'
export TF_VAR_client_cidrs='["0.0.0.0/0"]'
export TF_VAR_acm_certificate_arn='arn:aws:acm:ap-northeast-2:123456789012:certificate/00000000-0000-0000-0000-000000000000'
export TF_VAR_nlb_private_ips='{}'
```

- `vpc_id`, `subnets`: 기존 VPC와 서울 AZ별 subnet ID.
- `client_cidrs`: 기본 `["0.0.0.0/0"]`. public NLB의 TCP 443을 모든 IPv4 클라이언트에 허용해요.
- `trusted_principal_arn`: 클라이언트 프로파일의 IAM 사용자·Role ARN. 계정 번호가 들어가므로 환경변수 대신 Git에서 제외된 `terraform/labs/s07/terraform.tfvars`에 적어요. [목적과 값 확인](../../5-common-setup.md#trusted_principal_arn의-목적)을 따라요.
- [프록시 준비](../../5-common-setup.md#프록시-준비)의 도메인·인증서·EC2 조건을 먼저 확인해요.
- `proxy_domain`: 프록시 이름. 계정 정보라 환경변수 대신 `terraform/labs/s07/terraform.tfvars`에 적어요. 예제는 `s07-proxy.example.com`이에요.
- `route53_zone_id`: 권한 DNS가 Route 53이면 zone ID, 아니면 `null`. null이면 apply 뒤 `runtime/s07.json`의 `proxy.addresses` EIP로 그 사업자에 A 레코드를 직접 추가해요. 프록시·CDN 기능은 꺼요. NLB의 TLS를 클라이언트가 직접 받아야 CONNECT가 동작해요.
- `acm_certificate_arn`: 위 프록시 이름 또는 zone 와일드카드를 포함하는 `ISSUED` 상태의 서울 ACM 인증서 ARN.
- `nlb_private_ips = {}` 유지. Terraform이 AZ별 EIP를 할당해요.
- `arch = "arm64"`, `os_type = "al2023"` 기본값. EC2 프록시 한 대가 생성돼요.

계획을 확인한 뒤 배포해요.

```bash
terraform -chdir=terraform/labs/s07 init
terraform -chdir=terraform/labs/s07 plan
terraform -chdir=terraform/labs/s07 apply
mkdir -p runtime
terraform -chdir=terraform/labs/s07 output -json lab | jq . > runtime/s07.json.tmp &&
  mv runtime/s07.json.tmp runtime/s07.json
```

- 결과: `runtime/s07.json`. 항목 설명과 예제는 [runtime 설정 파일](../../8-runtime-config.md)에 있어요. 클라이언트가 다른 PC라면 이 파일과 코드·Python 의존성을 그 PC에 준비해요.
- 관리용 AWS 프로파일은 클라이언트 인증 경로와 별개예요.

기존 DNS를 사용하는 클라이언트에서 프록시 URL과 DNS 응답을 확인해요.

```bash
jq -r '.proxy_url' runtime/s07.json
dig +short "$(jq -r '.proxy_url' runtime/s07.json | sed -E 's#https://([^:/]+).*#\1#')" A
```

- 프록시 URL: `https://<proxy_domain>:443`.
- DNS 응답: public NLB EIP.

방화벽에 등록할 목적지 IPv4를 출력해요.

```bash
jq -r '.proxy.addresses[]' runtime/s07.json
```

- 출력 IP마다 목적지 TCP 443을 허용해요. 일반 DNS 질의 경로는 유지해요.

NLB target 상태를 관리 PC에서 확인해요.

```bash
jq -r '.proxy.target_group_arn' runtime/s07.json |
while IFS= read -r target; do
  aws elbv2 describe-target-health --region ap-northeast-2 --target-group-arn "$target"
done
```

- 모든 target이 healthy가 된 후 실험해요. TCP health check는 인증 성공을 뜻하지 않아요.

- 클라이언트 hosts와 resolver를 변경하지 않아요.
- `proxy_url`의 자체 도메인만 기존 DNS에서 NLB 주소로 해석하면 돼요.
- TLS proxy 인증서는 클라이언트가 신뢰하는 공인 CA 인증서여야 해요.

## Down

- 배포 때 사용한 관리용 터미널과 `TF_VAR_*` 값을 유지해요. 새 터미널에서는 [관리 인증](../../7-terraform-setup.md)과 위 입력값을 다시 설정해요.

이 시나리오의 리소스를 삭제해요.

```bash
terraform -chdir=terraform/labs/s07 destroy &&
  rm -f runtime/s07.json runtime/s07.json.tmp
```

- Memory와 남은 이벤트도 삭제돼요. 기존 VPC는 유지돼요.
- 실습용 Route 53 레코드는 삭제돼요. 기존 hosted zone·ACM 인증서는 유지돼요.
