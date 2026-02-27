# CLAUDE.md

콘텐츠 모아보기 대시보드 프로젝트 가이드.

## 개요

블로그와 유튜브 콘텐츠를 RSS 피드로 수집하여 주간 다이제스트 형태로 보여주는 정적 사이트.

## 디렉토리

```
product/content-aggregator/
├── frontend/index.html          # HTML 템플릿 (inline CSS/JS)
├── scripts/build.mjs            # 빌드 스크립트 (피드 수집 → dist/ 생성)
├── feeds.json                   # 피드 소스 설정
├── dist/                        # 빌드 결과물 (gitignored)
├── package.json                 # Node.js 의존성
└── terraform/
    ├── terraform.tf             # Terraform >= 1.11, AWS ~> 6.0, S3 backend
    ├── providers.tf             # ap-northeast-2
    ├── variables.tf             # 입력 변수
    ├── s3.tf                    # S3 웹사이트 호스팅 + Referer 비밀값 정책
    ├── iam.tf                   # GitHub OIDC + IAM role (기존 provider 참조)
    ├── outputs.tf               # s3_bucket_name, s3_website_endpoint, website_url, role_arn
    ├── backend.hcl              # S3 backend 버킷명 (gitignored)
    ├── terraform.tfvars         # 실제 값 (gitignored)
    └── terraform.tfvars.example # 예시 값
```

CI/CD: `.github/workflows/deploy-content-aggregator.yml`

## 아키텍처

```
GitHub Actions (weekly cron)
  ↓ node scripts/build.mjs
  ↓ Fetch RSS/Atom feeds → Generate dist/index.html
  ↓ aws s3 sync
Browser → Cloudflare CDN (HTTPS) → S3 Website Endpoint (HTTP)
               ↑
         Cloudflare DNS (weekly.akbun.com CNAME → S3 endpoint, Proxied)
```

- **CDN/DNS/SSL**: Cloudflare Free (SSL Flexible)
- **Origin**: S3 website hosting (버킷명 = 도메인명)
- **Origin 보호**: Referer 헤더 비밀값 — Cloudflare Transform Rule에서 설정, S3 버킷 정책에서 검증
- **캐시**: 브라우저 캐시 없음(`no-cache, max-age=0`), Cloudflare Cache Rule로 Edge 캐시만 사용
- **빌드**: GitHub Actions 주간 cron (매주 월요일 00:00 UTC) + push 트리거

## 피드 소스

| ID | 이름 | 타입 | URL |
|----|------|------|-----|
| tistory | 악분 기술블로그 | RSS | `https://malwareanalysis.tistory.com/rss` |
| naver | 여행 & 사진 | RSS | `https://rss.blog.naver.com/kgg1959.xml` |
| diary | 일상 기록 | RSS | `https://sungwook-diary.com/rss.xml` (fallback 포함) |
| youtube-akbun | 악분일상 | YouTube Atom | Channel ID: `UC7ctp-Pbn6y3J1VwtCtsnOQ` |
| youtube-bluesky | 푸르른 | YouTube Atom | Channel ID: **설정 필요** |

## 빌드 명령어

```bash
cd product/content-aggregator
npm ci
npm run build    # dist/index.html 생성
```

## Terraform 변수

| Variable | 설명 |
|----------|------|
| `project_name` | 리소스 네이밍 (기본: `content-aggregator`) |
| `aws_region` | AWS 리전 (기본: `ap-northeast-2`) |
| `domain_name` | 도메인 (예: `weekly.akbun.com`) |
| `github_repository` | GitHub 리포 (예: `choisungwook/portfolio`) |
| `cloudflare_referer_secret` | Referer 비밀값 (`sensitive`, tfvars에만 존재) |

## GitHub Secrets

| Secret | 출처 |
|--------|------|
| `WEEKLY_DEPLOY_ROLE_ARN` | Terraform output |
| `WEEKLY_S3_BUCKET` | Terraform output |
| `CLOUDFLARE_ZONE_ID` | Cloudflare Console |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Console (Cache Purge 권한) |

## Cloudflare Console 설정 (수동)

- DNS: CNAME `weekly` → S3 website endpoint (Proxied)
- SSL/TLS: Flexible
- Transform Rules: Referer 헤더에 비밀값 설정
- Cache Rules: `weekly.akbun.com` Edge TTL 1일

## 제약사항

- `terraform fmt -recursive && terraform validate` 필수
- S3 접근은 Referer 비밀값 일치 시에만 허용
- IAM: 최소 권한 (S3 put/delete만)
- GitHub OIDC: `thumbprint_list` 사용 금지
- 프론트엔드: 단일 HTML, inline CSS/JS
- 빌드: Node.js 22+ 필수

## TODO

- [ ] YouTube @blueskym1 채널 ID를 `feeds.json`에 입력
- [ ] sungwook-diary.com 피드 URL 확인 후 `feeds.json` 업데이트
