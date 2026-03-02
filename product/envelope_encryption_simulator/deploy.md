# How to deploy?

## 1단계: Cloudflare Pages 프로젝트 생성

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
2. GitHub 리포 선택: `choisungwook/portfolio`
3. Build settings:
   - **Build command**: `cd product/envelope_encryption_simulator && npm install && npm run build`
   - **Build output directory**: `product/envelope_encryption_simulator/dist`
   - **Root directory**: `/` (monorepo이므로 루트)
4. Deploy

## 2단계: 커스텀 도메인 연결

1. Pages 프로젝트 → Custom domains → `envelopelab.akbun.com`
2. Cloudflare가 자동으로 DNS CNAME 생성 + SSL 설정

## 3단계: 배포

master 브랜치에 push하면 Cloudflare Pages가 자동 빌드/배포.
