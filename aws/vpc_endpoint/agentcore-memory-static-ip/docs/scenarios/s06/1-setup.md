# S06 환경 준비와 정리

- 대상: 자체 도메인과 ACM 인증서를 붙인 public TLS NLB. 클라이언트는 `endpoint_url`만 그 도메인으로 바꿔요.
- S01 Terraform root에 opt-in으로 들어 있어요. `acm_certificate_arn`과 `tls_alias_domains`를 함께 넣으면 서비스별 TLS NLB·EIP·Route 53 레코드가 추가되고, 비우면 아무것도 만들지 않아요.
- 기존 S01 TCP NLB와 같은 endpoint ENI를 target으로 써요. VPC endpoint·Role·Memory는 새로 만들지 않아요.

## Up

- 선행: [공통 환경](../../5-common-setup.md), [Terraform 관리 인증](../../7-terraform-setup.md).
- 인증서: 두 이름을 모두 포함하는 `ISSUED` 상태의 **서울** ACM 인증서. zone 와일드카드(`*.demo.example.com`) 하나면 충분해요. S07과 같은 인증서를 재사용해도 돼요. 발급 조건은 [프록시 준비](../../5-common-setup.md#프록시-준비-s07)의 도메인·인증서 항목과 같아요.
- 이름: 서비스별로 하나씩이에요. 한 NLB의 TLS listener 하나로 두 서비스를 나눌 수 없어서예요. S05의 `sts_alias_domain`과는 다른 이름을 써요. 그 이름은 TCP NLB를 가리켜요.

`terraform/terraform.tfvars`에 S06 입력을 추가해요. 두 값은 함께 넣거나 함께 비워요.

```hcl
acm_certificate_arn = "arn:aws:acm:ap-northeast-2:123456789012:certificate/00000000-0000-0000-0000-000000000000"
tls_alias_domains   = { sts = "s06-sts.example.com", memory = "s06-memory.example.com" }
```

- `route53_zone_id`가 있으면 Terraform이 두 이름의 A alias를 TLS NLB로 만들어요.
- 다른 DNS 사업자면 apply 뒤 `runtime/config.json`의 `services.<svc>.tls_eips`로 `A <이름> → TLS NLB EIP`를 직접 추가해요. 프록시·CDN 기능은 꺼요.

S01과 같은 명령으로 올리고 실행 설정을 다시 만들어요. 이미 S01이 떠 있으면 같은 state에 TLS NLB만 추가돼요.

```bash
terraform -chdir=terraform apply
terraform -chdir=terraform output -json client_config | jq . > runtime/config.json
```

target 4개(TCP 2개 + TLS 2개)가 healthy가 될 때까지 기다려요.

```bash
jq -r '.services[] | .target_group_arn, .tls_target_group_arn' runtime/config.json |
while IFS= read -r target; do
  aws elbv2 describe-target-health --region ap-northeast-2 --target-group-arn "$target" \
    --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output text
done
```

- TLS target group의 health check는 TCP예요. healthy는 endpoint ENI에 TCP 연결이 된다는 뜻이고, TLS·인증·Host 수용은 실험에서 확인해요.

클라이언트에서 두 이름이 TLS NLB EIP로 풀리고 우리 인증서가 나오는지 확인해요.

```bash
for svc in sts memory; do
  host=$(jq -r ".services.$svc.own_domain_url" runtime/config.json | sed 's#https://##')
  dig +short "$host" A
  openssl s_client -connect "$host:443" -servername "$host" </dev/null 2>/dev/null |
    openssl x509 -noout -subject -issuer
done
```

- `dig` 결과가 `tls_eips`의 값과 같아야 해요. 안 풀리면 [zone 위임 topic](../../../knowledge/topics/demo-akbun-com-delegation.md).
- 인증서 issuer가 Amazon이고 subject가 우리 이름이면 바깥 TLS는 준비된 거예요.
- 방화벽에는 `tls_eips`의 TCP 443을 허용해요. `firewall_destination_ips` output에도 함께 들어 있어요.

## Down

- S06만 내리려면 tfvars에서 두 값을 지우고 다시 apply해요. TLS NLB·EIP·레코드만 사라지고 S01은 그대로예요.
- 전체를 내리는 `terraform destroy`는 S01과 함께 S06도 삭제해요. hosted zone과 ACM 인증서는 유지돼요.
