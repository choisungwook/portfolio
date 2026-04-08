# CLAUDE.md

셀프 호스팅 뉴스레터 플랫폼.

## 개요

Substack 대안 셀프 호스팅 뉴스레터. Astro + Cloudflare Pages + D1 + Resend.
`git clone` 후 바로 설치 가능한 템플릿 목표.

## 디렉토리

```
newsletter/
├── astro.config.mjs        # Astro 설정 (hybrid output, Cloudflare adapter)
├── wrangler.toml            # Cloudflare Pages + D1 바인딩
├── package.json
├── tsconfig.json
├── db/
│   └── schema.sql           # D1 subscribers 테이블 스키마
├── public/
│   └── favicon.svg
└── src/
    ├── env.d.ts             # Cloudflare 환경변수 타입
    ├── content/
    │   ├── config.ts        # Content Collection 스키마 (title, description, pubDate, tags, draft)
    │   └── posts/           # 마크다운 글 (frontmatter 필수)
    ├── layouts/
    │   └── Layout.astro     # 공통 레이아웃
    ├── components/
    │   ├── Header.astro     # 네비게이션 (피드, 검색)
    │   ├── PostCard.astro   # 피드 카드 UI
    │   ├── SubscribeForm.astro  # 이메일 구독 폼
    │   └── SearchBox.astro  # Pagefind 검색 UI
    ├── pages/
    │   ├── index.astro      # 피드 (정적)
    │   ├── search.astro     # 검색 (정적)
    │   ├── rss.xml.ts       # RSS 피드
    │   ├── posts/
    │   │   └── [...slug].astro  # 개별 글 (정적)
    │   ├── api/
    │   │   ├── subscribe.ts       # POST: 구독 (SSR)
    │   │   ├── unsubscribe.ts     # GET: 구독 해제 (SSR)
    │   │   └── newsletter/
    │   │       └── send.ts        # POST: 뉴스레터 발송 (SSR, 관리자 전용)
    │   └── admin/
    │       └── index.astro  # 관리자 페이지 (SSR, Basic Auth)
    └── styles/
        └── global.css       # 전역 스타일 (CSS 변수 기반)
```

CI/CD: `.github/workflows/deploy-newsletter.yml` (예정)

## 아키텍처

```
Browser → Cloudflare CDN (HTTPS) → Cloudflare Pages
               ↑                         ↓
         Cloudflare DNS            Pages Functions (SSR)
    (letter.akbun.com)                   ↓
                                   Cloudflare D1 (subscribers)
                                         ↓
                                   Resend API (이메일 발송)
```

- **프론트엔드**: Astro hybrid (정적 + SSR)
- **CDN/DNS/SSL**: Cloudflare Free
- **DB**: Cloudflare D1 (구독자 이메일만 저장)
- **이메일**: Resend (free tier: 3,000건/월)
- **검색**: Pagefind (빌드 시 인덱스 생성, 클라이언트 검색)
- **콘텐츠**: 마크다운 파일 (git 관리)
- **인증**: Basic Auth (ADMIN_PASSWORD 환경변수)

## 환경변수

| Variable | 설명 |
|----------|------|
| `ADMIN_PASSWORD` | 관리자 비밀번호 (Basic Auth) |
| `RESEND_API_KEY` | Resend API 키 |
| `SITE_URL` | 사이트 URL (예: `https://letter.akbun.com`) |
| `NEWSLETTER_FROM` | 발신 이메일 (예: `newsletter@akbun.com`) |

로컬 개발: `.dev.vars` 파일에 설정 (`.dev.vars.example` 참고)

## 글 작성

`src/content/posts/` 디렉토리에 마크다운 파일 추가.

frontmatter 필수 필드:
```yaml
---
title: "제목"
description: "설명"
pubDate: 2026-02-22
tags: ["태그1", "태그2"]
draft: false  # true면 비공개
---
```

## 명령어

```bash
npm run dev              # 로컬 개발 서버
npm run build            # 빌드 + Pagefind 인덱스 생성
npm run preview          # 빌드 결과 미리보기
npm run d1:create        # D1 데이터베이스 생성
npm run d1:migrate       # 프로덕션 스키마 적용
npm run d1:migrate:local # 로컬 스키마 적용
```

## 스킬

- **프론트엔드**: 인라인 CSS, 외부 JS 의존성 없음
- **글쓰기**: `/writing-with-akbunstyle`

## 제약사항

- Astro content collection frontmatter 스키마 준수
- `export const prerender = false` — SSR 라우트에만 사용
- D1 쿼리는 prepared statement만 사용
- Resend free tier 제한: 일 100건, 월 3,000건
- 관리자 인증: Basic Auth (복잡한 인증 불필요)
- 불필요한 주석 금지
