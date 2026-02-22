# CLAUDE.md

SLO Calculator 프로젝트 가이드.

## 개요

SLO 가용성(예: 99.99%)을 입력하면 허용 다운타임을 계산하는 정적 HTML 도구.

## 디렉토리

```
product/slo/
├── frontend/index.html          # 프로덕션 (inline CSS/JS, 빌드 없음)
└── terraform/
    ├── terraform.tf             # Terraform >= 1.11, AWS ~> 6.0, S3 backend
    ├── providers.tf             # ap-northeast-2
    ├── variables.tf             # 입력 변수
    ├── s3.tf                    # S3 웹사이트 호스팅 + Referer 비밀값 정책
    ├── iam.tf                   # GitHub OIDC + IAM role
    ├── outputs.tf               # s3_bucket_name, s3_website_endpoint, website_url, role_arn
    ├── backend.hcl              # S3 backend 버킷명 (gitignored)
    ├── terraform.tfvars         # 실제 값 (gitignored)
    └── terraform.tfvars.example # 예시 값
```

CI/CD: `.github/workflows/deploy-slo.yml`

## 아키텍처

```
Browser → Cloudflare CDN (HTTPS) → S3 Website Endpoint (HTTP)
               ↑
         Cloudflare DNS (slo.akbun.com CNAME → S3 endpoint, Proxied)
```

- **CDN/DNS/SSL**: Cloudflare Free (SSL Flexible)
- **Origin**: S3 website hosting (버킷명 = 도메인명)
- **Origin 보호**: Referer 헤더 비밀값 — Cloudflare Transform Rule에서 설정, S3 버킷 정책에서 검증
- **캐시**: 브라우저 캐시 없음(`no-cache, max-age=0`), Cloudflare Cache Rule로 Edge 캐시만 사용
- **배포**: GitHub Actions OIDC → S3 sync → Cloudflare cache purge

## Terraform 변수

| Variable | 설명 |
|----------|------|
| `project_name` | 리소스 네이밍 (기본: `slo-calculator`) |
| `aws_region` | AWS 리전 (기본: `ap-northeast-2`) |
| `domain_name` | 도메인 (예: `slo.akbun.com`) |
| `github_repository` | GitHub 리포 (예: `choisungwook/portfolio`) |
| `cloudflare_referer_secret` | Referer 비밀값 (`sensitive`, tfvars에만 존재) |

## GitHub Secrets

| Secret | 출처 |
|--------|------|
| `SLO_DEPLOY_ROLE_ARN` | Terraform output |
| `SLO_S3_BUCKET` | Terraform output |
| `CLOUDFLARE_ZONE_ID` | Cloudflare Console |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Console (Cache Purge 권한) |

## Cloudflare Console 설정 (수동)

- DNS: CNAME `slo` → S3 website endpoint (Proxied)
- SSL/TLS: Flexible
- Transform Rules: Referer 헤더에 비밀값 설정
- Cache Rules: `slo.akbun.com` Edge TTL 1일

## 스킬

- **프론트엔드**: `/frontend-design` + `/akbun-css-style`
- **Terraform**: `/terraform-style`

## 제약사항

- `terraform fmt -recursive && terraform validate` 필수
- S3 접근은 Referer 비밀값 일치 시에만 허용
- IAM: 최소 권한 (S3 put/delete만)
- GitHub OIDC: `thumbprint_list` 사용 금지
- 프론트엔드: 단일 HTML, inline CSS/JS, 외부 JS 의존성 없음
