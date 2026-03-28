---
paths:
  - product/slide-reference/
---

# Slide Reference — Agent Context

이 프로젝트는 AI agent가 PPT(HTML 슬라이드)를 만들 때 참고하는 레이아웃·디자인 레퍼런스다.

## 프로젝트 구조

```text
product/slide-reference/
  README.md          # 프로젝트 개요 + 레이아웃 목록
  AGENTS.md          # 이 파일 — agent 컨텍스트
  CLAUDE.md          # AGENTS.md delegation
  for-future.md      # 미래 AI agent를 위한 확장 가이드
  layouts/           # HTML 레이아웃 레퍼런스 파일들
  docs/              # 상세 문서
```

## 핵심 원칙

- 모든 레이아웃은 순수 HTML/CSS로 작성한다 (빌드 도구 없이 브라우저에서 바로 확인)
- 폰트 크기가 변해도 레이아웃이 깨지지 않아야 한다
- 도형 안 텍스트는 항상 가독성을 유지해야 한다
- 사용자가 자신만의 레이아웃/색상을 추가할 수 있는 구조

## Used Skills

| 작업 | Skill |
|------|-------|
| PPT 슬라이드 생성 | `slide-presentation` |

## 레이아웃 타입

| ID | 이름 | 용도 |
|----|------|------|
| study | 공부용 | 개념 정리, 코드 하이라이트 중심 |
| community | 커뮤니티 발표용 | 밋업, 컨퍼런스 발표 |
| executive | C-Level 발표용 | 임원 보고, 의사결정용 |
| comparison | 비교/분석용 | Before/After, 기술 비교 |
| timeline | 타임라인/프로세스용 | 단계별 프로세스, 로드맵 |
