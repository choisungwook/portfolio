# akbun-pdf LLM Wiki

다음 작업을 시작하는 agent가 코드보다 먼저 읽는 현재 상태 문서.

| 문서 | 내용 |
|---|---|
| [architecture.md](./architecture.md) | 프로세스 경계, DTO, 문서 상태와 화면 구성 |
| [development.md](./development.md) | 실행, 테스트, 화면 상태 확인, 릴리스와 updater 키 |
| [ADR index](../adr/index.md) | 현재 구현을 제약하는 결정과 이유 |

## 현재 구조

- Tauri adapter가 파일 선택·원자적 저장·OS 연결 담당
- Rust pdf-core가 문서 세션, 페이지 편집, 표준 주석, PDF 합치기 담당
- Vanilla TypeScript UI가 PDF.js 렌더링, text layer, 탐색과 편집 화면 담당
- UI와 Rust는 contracts의 DocumentState와 command DTO로만 연결
- 편집은 메모리에 보류하고 저장 시 원본 뒤에 변경 객체만 증분 기록
- 저장 전 같은 디렉터리의 임시 파일을 검증하고 원본 경로로 교체

파일 경로와 PDF 내부 객체는 UI 상태에 두지 않음. 구조를 바꾸기 전 [architecture.md](./architecture.md), 실행·검증·릴리스를 바꾸기 전 [development.md](./development.md)를 함께 읽음.
