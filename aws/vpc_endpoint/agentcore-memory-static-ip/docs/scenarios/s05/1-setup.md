# S05 환경 준비와 정리

- 대상: 자체 도메인의 public Route 53 레코드를 NLB에 매핑하고, 그 이름을 SDK endpoint로 사용하는 실패 사례.
- NLB나 endpoint를 추가로 만들지 않아요. 자체 이름 하나가 S01의 STS NLB EIP를 가리키기만 하면 돼요.

## Up

- S01 Terraform apply가 끝난 상태여야 해요.
- 이름은 `terraform/terraform.tfvars`의 `sts_alias_domain`이에요. 예제는 `s01-sts.example.com`.
- 권한 DNS가 Route 53이면 `route53_zone_id`에 zone ID를 넣어 Terraform이 A alias를 만들어요. 다른 사업자(Cloudflare 등)면 `route53_zone_id = null`로 두고 그 사업자에 `A <sts_alias_domain> → STS NLB EIP`를 직접 추가해요. 프록시(주황 구름) 같은 기능은 꺼요. 이 실험은 TCP 연결이 NLB까지 그대로 가야 해요.
- 권한 DNS는 `whois <도메인>`의 네임서버로 확인해요. [권한 조건](../../5-common-setup.md#프록시-준비-s07).
- 이 테스트는 hosts 변경이 필요 없어요. 이전 S01 hosts 블록이 남아 있으면 [hosts 원복](../../6-hosts-setup.md#down)을 먼저 수행해요.
- 인증서·개인 키·AWS 자격증명은 이 TLS 사전 검사에 필요하지 않아요.
- Python은 `NLB_ENDPOINT_URL` 환경변수 하나만 읽어요. 도메인을 코드에 넣지 않아요.

기존 DNS에서 자체 도메인이 NLB EIP로 해석되는지 확인하고 URL을 지정해요.

```bash
export NLB_ENDPOINT_URL="$(terraform -chdir=terraform output -raw sts_alias_url)"
dig +short "${NLB_ENDPOINT_URL#https://}" A
```

## Down

- S01 destroy가 레코드도 함께 삭제해요. hosted zone은 유지돼요.
