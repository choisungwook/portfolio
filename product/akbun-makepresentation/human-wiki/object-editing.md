# 객체 잠금, 생성 기본값, 코드 블록 크기

## 잠긴 외부 객체 안에서 편집

- 외부 객체 우클릭 → Lock.
- 잠긴 객체는 선택 가능하며 Inspector에 Locked 표시.
- 이동·리사이즈·회전·글·색상·삭제·Crop 차단.
- 겹친 내부 객체를 왼쪽 클릭하면 잠기지 않은 객체 우선 선택.
- 잠긴 외부 객체를 우클릭 → Unlock으로 편집 재개.
- 전체 선택 상태에서도 잠긴 객체의 위치와 스타일 유지.
- 선택 전체를 복사하거나 슬라이드를 복제하면 잠금 상태도 복사.
- 잠금은 객체 편집 범위에 적용되며 슬라이드 삭제를 차단하지 않음.

선택 대상과 변경 대상을 분리해야 잠금 해제 경로를 유지하면서 겹친 객체를 다룰 수 있음. 복사본 배치는 좌표 변환이 필요하므로 저수준 이동 함수는 잠금 여부를 판단하지 않음.

- 근거: [canvas.js:3](../workspace/src/renderer/canvas.js), [properties.js:3](../workspace/src/renderer/properties.js).
- 결정: [객체 잠금은 선택과 변경을 분리](../knowledge/decisions/2026-09-locks-preserve-selection.md).

## 생성 기본값

- Settings → General에서 도형 채우기·글자 색상·도형 및 이미지 테두리 설정.
- 테두리와 채우기의 none은 색상이 없는 상태.
- Arrow defaults에서 새 화살표의 Start end·Finish end 설정.
- 선과 펜은 끝 모양 없이 생성하고 Inspector에서 개별 변경.
- Inspector에서 바꾼 색상은 선택 객체에만 적용.
- 기존 객체·붙여넣기·프리셋은 자신이 가진 스타일 유지.
- 저장된 설정은 이후 생성하는 객체에 적용.

- 근거: [settings.js:137](../workspace/src/settings.js).
- 결정: [편집 기본값은 객체 종류별 로컬 설정으로 관리](../knowledge/decisions/2026-08-editor-defaults-are-local-settings.md).

## 코드 블록 크기

- 코드 입력 후 Apply하면 최장 줄과 줄 수에 맞게 가로·세로 크기 계산.
- 줄 번호·콜아웃·창 제목에 필요한 공간도 계산에 포함.
- 모서리를 드래그하면 상자와 글자 크기를 같은 배율로 변경.
- Crop은 내용 일부를 보여 주는 별도 동작.
- 슬라이드에 들어가지 않는 긴 코드는 글자도 함께 작아짐.
- 작은 글자가 불편하면 코드를 여러 블록이나 슬라이드로 나누는 방식 사용.
- 기기에 따른 고정폭 대체 글꼴 차이로 텍스트 폭에 작은 차이 발생 가능.

- 근거: [svg.js:116](../workspace/src/editor/svg.js), [code.js:116](../workspace/src/renderer/code.js).
- 결정: [코드 블록은 편집 모델과 PPTX 표현을 분리](../knowledge/decisions/2026-08-code-blocks-keep-source-metadata.md).

## 확인 질문

1. 잠긴 객체를 선택할 수 있어야 하는 이유는 무엇인가?
2. 전체 선택 후 색상을 바꾸면 잠긴 객체에도 적용되는가?
3. Inspector에서 바꾼 색상이 다음 객체에 적용되지 않는 이유는 무엇인가?
4. 코드 블록의 리사이즈와 Crop은 어떻게 다른가?
