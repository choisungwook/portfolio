# 독립 문서, 검색, 클립보드, 발표

## 파일별 독립 실행

- 문서를 보고 있는 창에서 File → Open 또는 Cmd+O로 열면 별도 앱 프로세스 생성.
- 파일이 없는 창에서 열면 그 창이 파일을 맡음. 프로필을 파일 것으로 바꾸고 설정과 AI 대화를 다시 읽음. 편집 중인 빈 문서라면 내용 폐기 여부 확인.
- Finder 더블클릭은 macOS가 실행 인자가 아니라 Opened 이벤트로 전달. 페이지가 시작 문서를 묻기 전이면 그 파일이 시작 문서가 되고, 뒤면 페이지가 위 규칙으로 처리. 예전에는 이 이벤트가 두 번째 프로세스를 띄워 빈 창과 파일 창이 함께 남았음.
- Cmd+N도 별도 프로세스에서 빈 문서 시작.
- 기존 문서의 편집 내용·선택·실행 취소·확대·실행 중 AI 유지.
- 설정·프리셋·AI 대화는 파일별 로컬 프로필에 저장.
- 같은 파일을 동시에 열면 설정·저장 대화의 사본으로 시작하고 이후 변경 분리.
- 새 문서는 최초 저장 후 같은 경로로 다시 열면 프로필 복원.
- Save As는 원래 경로의 설정·대화를 따로 보존.
- Finder에서 파일 경로를 바꾸면 다른 문서로 인식.
- 같은 파일에 직접 저장하면 디스크 내용은 마지막 저장이 기준.
- 이전 버전의 공용 설정·AI 데이터는 삭제하지 않으며 파일별 프로필로 자동 배정하지 않음.

프로세스가 다르면 한 앱의 종료나 실행 취소가 다른 앱의 메모리를 바꾸지 않음. 저장 공간도 별도로 두어 AI 대화를 종료·복원하는 동작이 다른 앱의 대화를 끝내지 않게 함.

- 근거: [documents.rs:66](../workspace/src-tauri/src/documents.rs), [files.js:34](../workspace/src/renderer/files.js), [desktop/lib.rs:34](../workspace/src-tauri/crates/desktop/src/lib.rs).
- 결정: [문서 프로세스와 프로필 분리](../knowledge/decisions/2026-09-document-process-and-profile-isolation.md).

## 전체 슬라이드 검색

- Cmd+F → 텍스트 입력 → 결과를 클릭해 슬라이드와 개체로 이동.
- 텍스트 상자·도형 안의 글·코드 블록을 검색.
- 대소문자와 호환 유니코드 표기를 정규화해 비교.
- Enter / Shift+Enter 또는 화살표 버튼으로 다음·이전 결과 이동.
- 결과 수는 검색어가 포함된 개체 수 기준.
- 이미지 내부 글자는 OCR하지 않음.
- 편집·슬라이드 삭제·실행 취소 후 검색 인덱스 갱신.
- 검색은 페이지 메모리에서 수행하고 입력마다 파일·Rust 명령을 호출하지 않음.
- 결과는 한 번에 100개만 렌더링하며 다음 결과 이동으로 전체 탐색 가능.

- 근거: [search.js:7](../workspace/src/editor/search.js), [renderer/search.js:10](../workspace/src/renderer/search.js).

## 다른 앱으로 개체 복사

- 개체 선택 → Cmd+C 또는 Edit → Copy.
- 시스템 클립보드에 PNG 이미지·일반 텍스트·편집용 개체 데이터를 함께 기록.
- 다른 프레젠테이션 앱 인스턴스에서는 개체로 붙여넣어 재편집 가능.
- 외부 앱에서는 지원 형식에 따라 PNG 또는 텍스트로 붙여넣기.
- 여러 개체의 PNG는 선택 영역을 하나의 이미지로 합성.
- 앱 내부 붙여넣기는 기존 최대 100개 개체 제한 적용.
- Cmd+X는 복사 성공 후 원본 삭제. 복사 실패나 준비 중 원본 변경 시 원본 유지.

- 근거: [clipboard.rs:7](../workspace/src-tauri/src/clipboard.rs), [renderer/clipboard.js:19](../workspace/src/renderer/clipboard.js).
- 결정: [시스템 복사 후 잘라내기](../knowledge/decisions/2026-09-cut-runs-the-copy-handler.md).

## 발표자 노트

- 캔버스 아래 입력란에 슬라이드별 노트 작성. 슬라이드를 복제하면 노트도 함께 복제.
- 타이핑마다 되돌리기 단계를 만들지 않고 입력란에서 포커스가 빠질 때 한 단계로 기록.
- PPTX 저장 시 노트가 있는 슬라이드만 notes page 생성. 노트가 하나도 없으면 notes 부품 없이 이전과 같은 파일.
- notes master는 슬라이드 master와 테마를 공유하지 않고 자기 테마 부품 사용.
- 열 때는 notes page의 본문 placeholder 글만 읽음. 노트 서식과 notes page 레이아웃은 보존 대상 아님.
- 발표 모드에는 노트를 표시하지 않음. 한 화면에 띄우면 청중도 보게 되므로 발표자 창 작업으로 분리.

- 근거: [notes.rs:99](../workspace/src-tauri/crates/deck/src/pptx/notes.rs), [write.rs:22](../workspace/src-tauri/crates/deck/src/pptx/write.rs), [slides.js:12](../workspace/src/renderer/slides.js).
- 결정: [발표자 노트는 PPTX notes page로 저장](../knowledge/decisions/2026-09-speaker-notes-are-notes-pages.md).

## 발표 모드 조작

- 발표 중 모든 키는 presentKey 하나가 받음. 편집 단축키가 청중 화면 뒤에서 실행되지 않음.
- 숫자를 입력한 뒤 Enter로 해당 슬라이드 이동. 다른 키를 누르면 입력 중인 번호 폐기.
- B/W로 화면 가리기. 가린 상태에서 누른 다음 키는 화면만 되돌리고 슬라이드는 넘기지 않음.
- L 레이저 포인터, O 전체 슬라이드 격자. 격자에서는 방향키와 Enter 또는 클릭으로 선택.
- 가리기·레이저·격자는 문서가 아닌 발표 상태. 발표를 새로 시작하면 초기화.

- 근거: [presentation.js:146](../workspace/src/renderer/presentation.js).

## 확인 질문

1. 별도 창만 만드는 것으로 AI 상태까지 분리되지 않는 이유는 무엇인가?
2. 같은 파일을 두 번 열 때 프로필 잠금이 필요한 이유는 무엇인가?
3. 검색 결과 수가 검색어 등장 횟수와 다를 수 있는 이유는 무엇인가?
4. 개체 JSON과 PNG를 같은 클립보드 기록에 넣는 이유는 무엇인가?
5. 비동기 복사 중 원본이 바뀌면 잘라내기가 삭제를 생략하는 이유는 무엇인가?
6. 노트가 없는 덱에 notes 부품을 쓰지 않는 이유는 무엇인가?
7. 가린 화면에서 방향키를 누르면 다음 슬라이드로 넘어가지 않는 이유는 무엇인가?
