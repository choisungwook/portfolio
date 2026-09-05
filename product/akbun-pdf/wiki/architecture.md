# Architecture

## 경계

```text
ui/ ── DocumentState DTO ──> src-tauri/src/ ──> crates/pdf-core/
 │                               │                    PDF 상태·저장·변환
 │                               ├───────────────> crates/pdf-ai/
 │                               │                    설정·JSONL·임시 이미지
 PDF.js·DOM                      Tauri command
 │
 └── JSON-RPC 이벤트 ──────> Codex App Server ──> ChatGPT 인증
```

| 경계 | 책임 | 금지 |
|---|---|---|
| `ui` | PDF.js 렌더링, 텍스트 계층, 탐색·보기 상태 | 파일 경로와 PDF 내부 객체 보관 |
| `src-tauri/src` | OS·파일 시스템 연결, command와 plugin 등록 | PDF 규칙 구현 |
| `pdf-core` | 문서 상태, 변경 목록, 저장·구조 편집 | Tauri 타입 의존 |
| `pdf-ai` | AI 설정, JSONL 대화, 요청 이미지 수명 | Tauri와 Codex 프로토콜 의존 |
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

- 상단 메뉴: 파일, 편집, 보기, 도움말과 updater 진입점
- 도구 모음: 열기, 합치기, 저장, 페이지 이동, 배율, 주석 도구
- 왼쪽: 끌기 재정렬이 가능한 페이지 썸네일과 회전·삭제
- 가운데: PDF.js canvas, text layer, 검색·주석 layer가 들어가는 문서 surface
- 오른쪽: PDF outline 기반 목차와 채팅형 AI 패널
- AI 페이지 선택: 현재 페이지, 직접 범위, 전체 페이지와 썸네일 다중 선택
- AI 승인: 문서·페이지·provider·모델을 확인한 뒤 요약 실행
- 주석: PDF.js text layer의 선택 영역과 페이지 좌표를 PDF user space로 변환
- 합치기: 열린 문서를 건드리지 않는 별도 dialog와 Rust 입력 저장소
- 개발 미리보기는 URL의 `state` query로 네 상태를 독립 확인

## AI 수명과 입력

- 앱 시작 시 설치된 Codex CLI의 App Server를 필요할 때 자식 프로세스로 실행
- `account/read`의 ChatGPT 인증만 허용하고 API key 인증은 사용하지 않음
- 기본 모델은 `gpt-5.6-luna`, 추론 수준은 `low`
- 선택 가능 모델은 Luna, Terra, Sol로 제한
- 시스템 프롬프트와 대화는 앱 데이터에 저장
- 대화는 메타데이터 한 줄과 메시지 줄로 구성한 JSONL 파일
- Codex thread는 휘발성으로 만들고 저장 대화를 열 때 JSONL 메시지를 주입
- 페이지 입력은 PDF.js 추출 텍스트와 PNG 렌더링 이미지를 함께 사용
- 6페이지씩 중간 요약하고 여러 묶음이면 최종 종합 turn 실행
- 요청 이미지는 앱 데이터의 runtime에 저장하고 turn 종료 또는 앱 시작 시 제거
- OCR과 OpenAI 호환 로컬 endpoint는 별도 기능으로 유지

## 확장 방향

- PDF 열기·저장: adapter가 경로를 받고 core에는 byte와 문서 식별자만 전달
- 주석: PDF Highlight·Text 객체와 벡터 appearance를 core 변경 목록에 기록
- OCR: 선택한 페이지의 raster와 결과 text layer만 교환
- 페이지 보정: 선택 페이지에만 기울기·원근 변환 적용

## 문서 수명과 검색

- Rust core가 원본 byte와 documentId 세션 보관
- 새 문서 열기와 닫기에서 이전 byte 즉시 해제
- PDF.js document와 Worker는 UI viewer가 소유하고 같은 시점에 destroy
- 변경 없는 저장은 원본 전체 byte를 그대로 기록하고 크기와 해시 비교
- 변경 저장은 원본 byte에 바뀐 페이지 트리·주석 객체만 증분 기록
- 저장은 같은 디렉터리 임시 파일을 검증한 뒤 원본 경로로 원자적 교체
- 페이지 삭제 시 삭제된 페이지를 직접 참조하는 목차 항목만 제거하고 나머지 연결 유지
- 합치기는 입력 페이지 객체를 새 페이지 트리에 연결하고 항상 새 파일로 저장
- 페이지 텍스트는 PDF.js Worker에서 순서대로 추출하고 준비된 페이지부터 검색
- 검색 캐시는 문서 닫기와 교체에서 즉시 제거
- PDF.js Worker와 JBIG2·OpenJPEG·QCMS WASM 자산은 Vite가 같은 자산 디렉터리에 번들
- 열기 중 PDF.js 렌더링 실패 시 Rust 세션과 UI 페이지 surface를 함께 해제
