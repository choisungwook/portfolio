# Editor UI design

## Source of truth

- [editor-layout.svg](./editor-layout.svg): Figma에서 import 가능한 편집기 레이아웃
- [tokens.tokens.json](./tokens.tokens.json): Design Tokens Community Group 형식의 크기와 색상
- [../adr/index.md](../adr/index.md): UI 구현에 영향을 주는 아키텍처 결정

## Layout

- Title Bar: 좌측 메뉴, 우측 Global Action Bar
- 기본 상태: 우측 선택 패널 닫힘
- 열린 상태: Assets 264px / Source 1fr / Program 1fr / Selected Panel 280px
- Global Action Bar: Inspector / Shape / Marker / Debug
- Panel Tab Bar: Video / Audio / Effects / Transition / Image / File
- Timeline: 편집 툴바 / ruler와 tracks

## Interaction

- 닫힌 Global Action을 누르면 해당 선택 패널을 연다.
- 열린 Global Action을 다시 누르면 선택 패널을 닫는다.
- 다른 Global Action을 누르면 같은 영역에서 패널 내용만 바꾼다.
- Shape 버튼은 클릭하면 playhead에 추가하고 drag하면 video track에 추가한다.
- Marker 패널은 marker를 timeline frame 오름차순으로 표시한다.
- Debug는 선택 패널 안에서 갱신하며 별도 floating aside를 만들지 않는다.
