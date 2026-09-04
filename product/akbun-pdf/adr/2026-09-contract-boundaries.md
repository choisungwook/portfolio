# UI와 PDF core 사이의 계약 경계

## 결정

- `workspace/ui`, `workspace/src-tauri/src`, `workspace/src-tauri/crates/pdf-core`, `workspace/contracts`로 분리
- UI는 문서 상태와 command DTO만 사용
- 상태 변경 command는 전체 `DocumentState` 반환

## 이유

- 화면 기술 교체가 PDF 처리와 저장 구현으로 전파되는 결합 방지
- 순수 Rust core 테스트에서 Tauri, GTK, WebKit 의존 제거
- Rust 내부 형식과 파일 경로의 UI 노출 방지
