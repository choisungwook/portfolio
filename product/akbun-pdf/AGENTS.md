# akbun-pdf Agent Guide

## 먼저 읽을 문서

- 구조 변경 전 `wiki/index.md`와 `wiki/architecture.md`
- 구현 결정 변경 전 `adr/index.md`와 관련 ADR
- 빌드·릴리스 변경 전 `wiki/development.md`

## 경계

- `workspace/ui`: DOM, PDF.js 렌더링, 즉시 반응해야 하는 보기 상태
- `workspace/src-tauri/src`: Tauri command, 파일 선택 결과 전달, OS 연결부
- `workspace/src-tauri/crates/pdf-core`: Tauri 타입을 모르는 PDF 상태·저장·변환 로직
- `workspace/contracts`: UI와 Rust가 교환하는 명령·상태 DTO
- UI에서 파일 경로나 PDF 내부 객체를 상태로 보관하지 않음
- 상태를 바꾸는 command는 갱신된 `DocumentState` 전체를 반환

## 소스 크기

- 자체 작성 `.ts`, `.js`, `.mjs`, `.rs`, `.css`, `.html` 파일은 1,000줄 미만
- 생성 파일, vendored 소스, lock 파일, 아이콘은 검사 제외
- `npm run check:size` 실패 시 책임 기준으로 파일 분리

## 검증

```bash
cd workspace
npm run check
```

- 화면 확인용 상태: `?state=empty`, `?state=loading`, `?state=ready`, `?state=error`
- 로컬 검증에서 설치 패키지, updater 산출물, 서명 빌드 생성 금지
