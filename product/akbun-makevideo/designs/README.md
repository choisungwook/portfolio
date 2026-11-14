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
- AI Edit studio: Prepare / Story / Layers / Finish 단계, 스크롤 가능한 내용과 하단 요청 입력
- 편집 제안: 실제 적용 전에 변경 목록 표시, 컷 구간 버튼으로 원본 위치 탐색
- 색상 token과 시스템 글꼴은 Visual system 절을 따름, 준비 단계에서는 입력창을 접어 분석 영역 확보

## Visual system

akbun-makepresentation 0.30.1의 화면 설정을 영상 편집기에 맞춰 옮겼다. 값의 원본은 `workspace/src/style.css`의 `:root`이고, 이 절과 코드가 다르면 코드를 따른다.

원칙:

- 시각의 중심은 monitor의 영상이다. 편집기 장식은 줄인다.
- 영역은 테두리보다 배경 차이와 그림자로 구분한다. 1px `--border`는 큰 영역 사이(Assets, monitor, Selected Panel, timeline)에만 남긴다.
- control은 테두리 없는 버튼이 기본이다. 채움은 `--control`, hover는 `--hover`, 켜진 상태는 `--accent-soft` 배경에 `--accent` 글자다.
- 색은 CSS 변수로만 지정한다. 규칙 본문에 hex나 rgba를 직접 쓰지 않는다. 예외는 monitor 위에 얹는 hint와 mode badge다. 영상 위에 그리므로 앱 테마를 따르지 않는다.
- 글자는 시스템 글꼴 13px이다. 대문자 변환과 자간 조정을 쓰지 않는다.
- 전환은 `--ease`(140ms) 하나만 쓰고 `prefers-reduced-motion`에서는 없앤다.

색 token (light / dark):

| token | light | dark | 쓰는 곳 |
|---|---|---|---|
| `--bg` | `#f4f5f7` | `#1b1c1f` | 창 배경 |
| `--panel` | `#ffffff` | `#26272b` | 메뉴바, capsule, 메뉴, sheet, monitor head와 transport |
| `--panel-soft` | `#f5f5f7` | `#2a2b2f` | Assets, Selected Panel, track head, ruler |
| `--stage` | `#e4e5e9` | `#1e1f22` | timeline toolbar 띠, lane 배경 |
| `--fg` | `#1c1d21` | `#e9eaee` | 본문 글자 |
| `--muted` | `#7a808c` | `#9197a3` | 보조 글자 |
| `--border` | `#e3e5ea` | `#37393f` | 큰 영역 사이 구분선 |
| `--accent` | `#2f6fed` | `#6ea0ff` | 강조, 주 버튼, 메뉴 hover 행 |
| `--accent-soft` | `#e3ecff` | `#24385f` | 켜진 버튼 배경 |
| `--on-accent` | `#ffffff` | `#10131a` | 강조색 위 글자 |
| `--control` | `rgba(0,0,0,.05)` | `rgba(255,255,255,.08)` | 버튼, 입력, select 채움 |
| `--chip` | `#ffffff` | `#3d3f46` | 분할 control의 선택 칸 |
| `--hover` | `rgba(20,24,40,.06)` | `rgba(255,255,255,.07)` | hover 배경 |
| `--danger` | `#e03131` | `#ff6b6b` | 삭제, 경고 |
| `--danger-soft` | `rgba(224,49,49,.12)` | `rgba(255,107,107,.16)` | 경고 배경 |

영상 편집기에만 있는 token은 값을 유지한다: `--monitor`(monitor 배경, 예전 이름 `--stage`), `--clip-*`, `--select`, `--on-select`, `--mark-in`, `--mark-out`, `--grid`, 크기 변수.

모양 token:

- 반경: `--radius` 7px(버튼, 메뉴 행), `--radius-s` 5px(입력), capsule 999px, 메뉴와 context menu 12px, sheet 16px
- 그림자: `--shadow-1`(capsule, 분할 control의 선택 칸), `--shadow-2`(메뉴, context menu, sheet)
- 전환: `--ease` 140ms

배치:

- 메뉴바: 창 전체 너비, `--panel` 배경과 아래 구분선. 메뉴 제목은 테두리 없이 hover와 열림에서 `--hover` 배경.
- 메뉴와 context menu: 행 높이 28px, hover와 keyboard focus 행은 `--accent` 배경에 `--on-accent` 글자, 묶음 사이 구분선.
- Global Action Bar: 열린 패널의 버튼은 `--accent-soft` 배경에 `--accent` 글자. Assets와 Source 토글은 둘 다 기본으로 켜져 있어 켜짐을 `--control` 채움으로, 꺼짐을 `--muted` 글자로만 표시한다.
- Panel head: 12px 굵은 `--muted` 제목. 아래 테두리 없음.
- Timeline toolbar: `--stage` 띠 위에 `--panel` capsule을 10px 간격으로 둔다. 묶음은 편집 도구(split, snap, delete, ripple delete) / clip(Link Clips, + Text) / track(+ Video, + Audio, + Subtitle) / 자막(Import SRT, Export SRT) / 오른쪽 끝 Zoom. capsule 안 버튼은 투명하고 hover에서 `--hover`.
- 분할 control(`.segmented`, Panel Tab Bar, AI section tab, AI workflow step): `--control` 바탕에 선택 칸만 `--chip` 배경과 `--shadow-1`.
- Sheet: 테두리 없이 `--shadow-2`. dark에서는 배경과 겹치지 않도록 1px `--border`를 남긴다.

선택 표시:

- clip 선택과 playhead는 `--select`(주황)를 유지한다. video clip이 파란 계열이라 `--accent` 윤곽은 clip 색과 구분되지 않는다.
- asset 선택은 테두리 대신 `--accent-soft` 배경.
- keyboard focus는 `--accent` 2px outline.

## Interaction

- 닫힌 Global Action을 누르면 해당 선택 패널을 연다.
- 열린 Global Action을 다시 누르면 선택 패널을 닫는다.
- 다른 Global Action을 누르면 같은 영역에서 패널 내용만 바꾼다.
- Shape 버튼은 클릭하면 playhead에 추가하고 drag하면 video track에 추가한다.
- Marker 패널은 marker를 timeline frame 오름차순으로 표시한다.
- Debug는 선택 패널 안에서 갱신하며 별도 floating aside를 만들지 않는다.
