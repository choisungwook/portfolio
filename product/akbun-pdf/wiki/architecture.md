# Architecture

## 경계

```text
ui/ ── DocumentState DTO ──> src-tauri/src/ ──> crates/pdf-core/
 │                               │                    │
 PDF.js·DOM                      Tauri command        PDF 상태·저장·변환
```

| 경계 | 책임 | 금지 |
|---|---|---|
| `ui` | PDF.js 렌더링, 텍스트 계층, 탐색·보기 상태 | 파일 경로와 PDF 내부 객체 보관 |
| `src-tauri/src` | OS·파일 시스템 연결, command와 plugin 등록 | PDF 규칙 구현 |
| `pdf-core` | 문서 상태, 변경 목록, 저장·구조 편집 | Tauri 타입 의존 |
| `contracts` | 명령과 직렬화 DTO의 공개 이름 | Rust 내부 타입 노출 |

## 문서 상태

- `empty`: 열린 문서 없음
- `loading`: 파일을 받고 페이지·목차 준비 중
- `ready`: 페이지와 탐색 정보 표시
- `error`: 복구 가능한 오류와 다시 열기 동작 표시
- 상태 변경 command는 부분 patch 대신 전체 `DocumentState` 반환
- `currentPage`는 문서 없음일 때만 0, 열린 문서에서는 1부터 시작
- 페이지 순서·회전·삭제와 주석은 `dirty` 상태의 변경 목록으로 유지
- 저장 성공 후 새 byte를 기준 문서로 교체하고 `dirty` 해제

## UI 구성

- 상단: 열기, 페이지 이동, 배율, 향후 편집 도구, updater
- 왼쪽: 페이지 썸네일과 현재 페이지
- 가운데: PDF.js canvas와 text layer가 들어갈 문서 surface
- 오른쪽: PDF outline 기반 목차
- 주석: PDF.js text layer의 선택 영역과 페이지 좌표를 PDF user space로 변환
- 합치기: 열린 문서를 건드리지 않는 별도 dialog와 Rust 입력 저장소
- 개발 미리보기는 URL의 `state` query로 네 상태를 독립 확인

## 확장 방향

- PDF 열기·저장: adapter가 경로를 받고 core에는 byte와 문서 식별자만 전달
- 주석: PDF Highlight·Text 객체와 벡터 appearance를 core 변경 목록에 기록
- OCR: 선택한 페이지의 raster와 결과 text layer만 교환
- 페이지 보정: 선택 페이지에만 기울기·원근 변환 적용

## 문서 수명과 검색

- Rust core가 원본 byte와 documentId 세션 보관
- 새 문서 열기와 닫기에서 이전 byte 즉시 해제
- PDF.js document와 Worker는 UI viewer가 소유하고 같은 시점에 destroy
- 변경 없는 저장은 원본 전체 byte를 그대로 기록한 뒤 크기와 해시 비교
- 변경 저장은 원본 byte에 바뀐 페이지 트리·주석 객체만 증분 기록
- 저장은 같은 디렉터리 임시 파일을 검증한 뒤 원본 경로로 원자적 교체
- 합치기는 입력 페이지 객체를 새 페이지 트리에 연결하고 항상 새 파일로 저장
- 페이지 텍스트는 PDF.js Worker에서 순서대로 추출하고 준비된 페이지부터 검색
- 검색 캐시는 문서 닫기와 교체에서 즉시 제거
