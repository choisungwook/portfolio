# Slide Reference -- Agent Context

## 개요

AI agent가 PPT(HTML 슬라이드)를 생성할 때 참조하는 레이아웃 레퍼런스 모음이다. Astro 정적 사이트로 빌드하여 Cloudflare Pages에 배포한다.

## 프로젝트 구조

```
product/slide-reference/
  public/layouts/    -- 5종 레이아웃 HTML (정적 파일로 서빙)
  src/pages/         -- Astro 페이지 (index.astro = 갤러리)
  docs/              -- 색상 팔레트, 레이아웃 가이드, 향후 작업
  deploy.md          -- Cloudflare Pages 배포 가이드
```

## 빌드/배포

로컬 개발 서버 실행:

```bash
cd product/slide-reference && npm install && npm run dev
```

정적 빌드:

```bash
npm run build
```

빌드 결과물은 `dist/`에 생성된다. Cloudflare Pages 배포 절차는 `deploy.md`를 참고한다.

## 레이아웃 파일 규칙

- 위치: `public/layouts/{type}-{variant}.html`
- 네이밍: `{type}-{variant}.html` (예: study-default.html)
- HTML 내용 변경 시 갤러리 페이지(`src/pages/index.astro`)의 메타데이터도 함께 업데이트한다
- 새 레이아웃 추가 시: `index.astro`의 layouts 배열에 항목을 추가한다

## Used Skills

- `slide-presentation` -- 슬라이드 생성 시 이 레이아웃들을 참조
- `writing-with-akbunstyle` -- 한국어 문서 작성
