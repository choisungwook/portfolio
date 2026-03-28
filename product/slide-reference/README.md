# Slide Reference — AI Agent용 슬라이드 레이아웃 레퍼런스

## 개요

AI agent가 PPT(HTML 슬라이드)를 생성할 때 참고하는 레이아웃·디자인 레퍼런스 모음이다. [make-slide.vercel.app](https://make-slide.vercel.app/)과 유사하지만, **폰트 크기 반응형 대응**과 **도형 안 텍스트 가독성** 문제를 해결하는 데 초점을 둔다.

## 왜 만들었나

- make-slide.vercel.app은 폰트가 작고, 폰트 크기를 키우면 도형 안 텍스트 배치가 불편해진다
- AI agent가 슬라이드를 생성할 때 일관된 레이아웃 기준이 없으면 매번 품질이 들쑥날쑥하다
- 레이아웃을 코드(HTML/CSS)로 관리하면 git pull로 자신만의 레이아웃/색상을 추가할 수 있다

## 레이아웃 목록

| 파일 | 타입 | 용도 |
|------|------|------|
| [study-default.html](./layouts/study-default.html) | 공부용 | 개념 정리, 코드 하이라이트 중심. 스터디, 사내 학습 공유 |
| [community-default.html](./layouts/community-default.html) | 커뮤니티 발표용 | 밋업, 컨퍼런스. 시각적 임팩트와 스토리텔링 중심 |
| [executive-default.html](./layouts/executive-default.html) | C-Level 발표용 | 임원 보고, 의사결정. 핵심 수치와 결론 먼저 |
| [comparison-default.html](./layouts/comparison-default.html) | 비교/분석용 | Before/After, 기술 비교, 장단점 분석 |
| [timeline-default.html](./layouts/timeline-default.html) | 타임라인/프로세스용 | 단계별 프로세스, 로드맵, 장애 타임라인 |

## 사용 방법

각 HTML 파일을 브라우저에서 열면 슬라이드 미리보기를 확인할 수 있다.

```bash
open layouts/study-default.html
```

AI agent가 PPT를 생성할 때는 `slide-presentation` skill이 자동으로 이 레이아웃들을 참조한다.

## 확장

자신만의 레이아웃이나 색상을 추가하려면 [for-future.md](./for-future.md)를 참고한다.

## 문서 목차

| 문서 | 설명 |
|------|------|
| [for-future.md](./for-future.md) | 미래 AI agent를 위한 확장 가이드 |
| [docs/color-palettes.md](./docs/color-palettes.md) | 색상 팔레트 모음 |
| [docs/layout-guide.md](./docs/layout-guide.md) | 레이아웃 타입별 사용 가이드 |
