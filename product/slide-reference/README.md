# Slide Reference -- AI Agent용 슬라이드 레이아웃 레퍼런스

## 개요

AI agent가 PPT(HTML 슬라이드)를 생성할 때 참고하는 레이아웃/디자인 레퍼런스 모음이다.

## 왜 만들었나

- AI로 파워포인트를 만들 때 참조할 디자인 레퍼런스가 갖고 싶었다
- AI agent가 슬라이드를 생성할 때 일관된 레이아웃 기준이 없으면 매번 품질이 들쑥날쑥하다
- 레이아웃을 코드(HTML/CSS)로 관리하면 git pull로 자신만의 레이아웃/색상을 추가할 수 있다

## 레이아웃 목록

| 파일 | 타입 | 용도 |
|------|------|------|
| [study-default.html](./public/layouts/study-default.html) | 공부용 | 개념 정리, 코드 하이라이트 중심. 스터디, 사내 학습 공유 |
| [community-default.html](./public/layouts/community-default.html) | 커뮤니티 발표용 | 밋업, 컨퍼런스. 시각적 임팩트와 스토리텔링 중심 |
| [executive-default.html](./public/layouts/executive-default.html) | C-Level 발표용 | 임원 보고, 의사결정. 핵심 수치와 결론 먼저 |
| [comparison-default.html](./public/layouts/comparison-default.html) | 비교/분석용 | Before/After, 기술 비교, 장단점 분석 |
| [timeline-default.html](./public/layouts/timeline-default.html) | 타임라인/프로세스용 | 단계별 프로세스, 로드맵, 장애 타임라인 |

## 사용 방법

### 웹 갤러리

배포된 웹 갤러리에서 모든 레이아웃을 미리보기할 수 있다: <https://slideref.akbun.com>

### 로컬에서 확인

Astro 개발 서버를 실행한다:

```bash
cd product/slide-reference && npm install && npm run dev
```

또는 HTML 파일을 직접 브라우저에서 연다:

```bash
open public/layouts/study-default.html
```

AI agent가 PPT를 생성할 때는 `slide-presentation` skill이 자동으로 이 레이아웃들을 참조한다.

## 레이아웃 수정

자신만의 레이아웃이나 색상을 추가하려면 [레이아웃 추가/수정 가이드](./docs/update-layout.md)를 참고한다.

## 문서 목차

| 문서 | 설명 |
|------|------|
| [docs/update-layout.md](./docs/update-layout.md) | 레이아웃 추가/수정 가이드 |
| [docs/for-future-agents.md](./docs/for-future-agents.md) | 미래 AI agent를 위한 작업 목록 |
| [docs/color-palettes.md](./docs/color-palettes.md) | 색상 팔레트 모음 |
| [docs/layout-guide.md](./docs/layout-guide.md) | 레이아웃 타입별 사용 가이드 |
| [deploy.md](./deploy.md) | Cloudflare Pages 배포 가이드 |
