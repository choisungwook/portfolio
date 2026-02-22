# 셀프 호스팅 뉴스레터 플랫폼

## 요약

- Substack 대안으로 만든 셀프 호스팅 뉴스레터 플랫폼
- **Astro + Cloudflare Pages + D1 조합으로 월 비용 $0에 가깝게 운영 가능**
- 마크다운으로 글을 쓰고, git push하면 자동 배포
- 구독자 이메일 수집 + Resend로 뉴스레터 발송
- Pagefind로 클라이언트 사이드 전문 검색 지원
- `git clone` 후 바로 설치 가능

## 목차

- [왜 만들었을까?](#왜-만들었을까)
- [아키텍처](#아키텍처)
- [기술 스택](#기술-스택)
- [설치](#설치)
- [글 작성 방법](#글-작성-방법)
- [환경변수 설정](#환경변수-설정)
- [Cloudflare 설정](#cloudflare-설정)
- [비용](#비용)
- [참고자료](#참고자료)

## 왜 만들었을까?

Substack은 플랫폼입니다. **플랫폼은 언제 없어질지 모릅니다.**

저는 콘텐츠를 플랫폼에 의존하고 싶지 않았습니다. 마크다운 파일로 글을 관리하면 플랫폼이 사라져도 콘텐츠는 git에 남습니다.

그래서 WordPress 템플릿처럼 누구나 `git clone`해서 설치할 수 있는 뉴스레터 플랫폼을 만들었습니다.

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

정리하면 두 가지 영역으로 나뉩니다.

1. **정적 영역**: 글 목록(피드), 개별 글, 검색 페이지 → 빌드 시 HTML 생성
2. **동적 영역**: 구독 API, 뉴스레터 발송 API, 관리자 페이지 → Cloudflare Pages Functions(SSR)

**콘텐츠는 마크다운 파일로 git에서 관리하고, 구독자 이메일만 D1 데이터베이스에 저장합니다.**

## 기술 스택

| 영역 | 기술 | 역할 |
|------|------|------|
| 프레임워크 | Astro (hybrid) | 정적 페이지 + SSR API |
| 호스팅 | Cloudflare Pages | 배포, CDN, SSL |
| 데이터베이스 | Cloudflare D1 | 구독자 이메일 저장 |
| 이메일 | Resend | 뉴스레터 발송 |
| 검색 | Pagefind | 빌드 시 인덱스 생성, 클라이언트 검색 |
| 인증 | Basic Auth | 관리자 전용 (환경변수 비밀번호) |

### 왜 Astro + Cloudflare Pages인가?

Astro는 hybrid output을 지원합니다. 글 페이지는 정적으로 빌드하고, API 엔드포인트만 SSR로 처리합니다. **정적 페이지는 빠르고, SSR은 최소한으로만 사용해서 비용을 줄입니다.**

Cloudflare Pages는 free tier가 넉넉합니다. 월 500회 빌드, 무제한 bandwidth, D1 free tier까지 포함됩니다.

### 왜 DB가 필요한가?

콘텐츠는 마크다운 파일로 충분합니다. 하지만 **구독자 이메일 목록은 DB가 필요합니다.** 이메일을 파일로 관리하면 구독/해지 시 git commit이 필요하기 때문입니다.

D1은 Cloudflare의 edge SQLite입니다. 구독자 테이블 하나만 쓰기 때문에 free tier로 충분합니다.

### 왜 Pagefind인가?

Pagefind는 빌드 시 정적 검색 인덱스를 생성합니다. **서버 비용 없이 클라이언트에서 전문 검색이 가능합니다.** Algolia같은 외부 서비스가 필요 없습니다.

## 설치

### 1. 저장소 클론

```bash
git clone https://github.com/choisungwook/portfolio.git
cd portfolio/newsletter
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경변수 설정

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` 파일을 열어 값을 입력합니다.

### 4. D1 데이터베이스 생성 (로컬)

```bash
npm run d1:migrate:local
```

### 5. 개발 서버 실행

```bash
npm run dev
```

### 6. 빌드

```bash
npm run build
```

빌드 후 Pagefind 검색 인덱스가 자동 생성됩니다.

## 글 작성 방법

`src/content/posts/` 디렉토리에 마크다운 파일을 추가합니다.

```yaml
---
title: "글 제목"
description: "글 설명"
pubDate: 2026-02-22
tags: ["태그1", "태그2"]
draft: false
---

본문 내용
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `title` | O | 글 제목 |
| `description` | O | 피드에 표시되는 설명 |
| `pubDate` | O | 발행일 |
| `tags` | X | 태그 목록 (기본: 빈 배열) |
| `draft` | X | `true`면 비공개 (기본: `false`) |

`draft: true`로 설정하면 피드에 나타나지 않습니다.

## 환경변수 설정

| 변수 | 설명 |
|------|------|
| `ADMIN_PASSWORD` | 관리자 비밀번호 |
| `RESEND_API_KEY` | Resend API 키 |
| `SITE_URL` | 사이트 URL |
| `NEWSLETTER_FROM` | 발신 이메일 주소 |

로컬 개발은 `.dev.vars`, 프로덕션은 Cloudflare Pages 환경변수에 설정합니다.

## Cloudflare 설정

### DNS

`letter.akbun.com`을 CNAME으로 Cloudflare Pages 프로젝트에 연결합니다.

### D1 데이터베이스

```bash
npm run d1:create
```

생성된 `database_id`를 `wrangler.toml`에 입력합니다.

```bash
npm run d1:migrate
```

### Resend

[Resend](https://resend.com)에서 API 키를 발급받습니다. 도메인 인증이 필요합니다.

## 비용

| 서비스 | 비용 |
|--------|------|
| Cloudflare Pages | 무료 (500 빌드/월) |
| Cloudflare D1 | 무료 (5M rows read/일, 100K rows write/일) |
| Resend | 무료 (3,000건/월) |
| **합계** | **$0/월** |

**구독자 1,000명 이하, 월 10회 이하 발송 기준으로 무료입니다.**

## 참고자료

- https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- https://developers.cloudflare.com/pages/
- https://developers.cloudflare.com/d1/
- https://resend.com/docs
- https://pagefind.app/
