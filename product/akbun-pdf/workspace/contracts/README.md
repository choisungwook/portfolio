# UI ↔ Tauri contracts

- `document-state.schema.json`: 화면이 그리는 전체 문서 상태
- `commands.schema.json`: 화면이 호출할 명령과 요청·응답 DTO
- 화면은 파일 경로, PDF 내부 객체, Rust enum을 직접 사용하지 않음
- 상태를 바꾸는 명령은 갱신된 `DocumentState` 전체를 반환
- 스키마의 camelCase 이름을 TypeScript와 Rust 직렬화 이름에 동일하게 적용
- 문서 경로는 open/save 요청에만 사용하고 상태에는 `documentId`만 유지
- 변경 없는 저장은 원본 전체 byte와 크기·해시를 비교한 `PreservationReport` 반환
