# UI ↔ Tauri contracts

- `document-state.schema.json`: 화면이 그리는 전체 문서 상태
- `commands.schema.json`: 화면이 호출할 명령과 요청·응답 DTO
- 화면은 파일 경로, PDF 내부 객체, Rust enum을 직접 사용하지 않음
- 상태를 바꾸는 명령은 갱신된 `DocumentState` 전체를 반환
- 스키마의 camelCase 이름을 TypeScript와 Rust 직렬화 이름에 동일하게 적용
- 문서 경로는 open/save-as 요청에만 사용하고 상태에는 `documentId`만 유지
- 저장은 갱신된 상태·byte와 스트림 보존 여부를 포함한 `SaveResult` 반환
- 합치기 입력 경로는 Rust 저장소의 불투명한 파일 ID로 교체해 화면에 반환
