# How to deploy?

## 1. Terraform

```bash
cd product/slo/terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars 편집 (cloudflare_referer_secret 포함)
terraform init -backend-config=backend.hcl
terraform plan && terraform apply
```

## 2. Cloudflare Console (수동)

- DNS: CNAME `slo` → Terraform output `s3_website_endpoint` (Proxied)
- SSL/TLS: Flexible
- Transform Rules → Modify Request Header: `Referer`를 terraform.tfvars의 비밀값과 동일하게 설정
- Cache Rules: `slo.akbun.com` hostname, Edge TTL 1일

## 3. GitHub Secrets

| Secret | 출처 |
|--------|------|
| `SLO_DEPLOY_ROLE_ARN` | Terraform output |
| `SLO_S3_BUCKET` | Terraform output |
| `CLOUDFLARE_ZONE_ID` | Cloudflare Console |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Console |

## 수동 배포

```bash
aws s3 sync frontend/ s3://slo.akbun.com --delete --cache-control "no-cache, max-age=0"
```
