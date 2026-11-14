# 객체 잠금, 생성 기본값, 코드 블록 크기

## 잠긴 외부 객체 안에서 편집

- 외부 객체 우클릭 → Lock.
- 잠긴 객체는 선택 가능하며 Inspector 헤더의 잠금 버튼이 눌린 상태로 표시.
- 이동·리사이즈·회전·글·색상·삭제·Crop 차단.
- 겹친 내부 객체를 왼쪽 클릭하면 잠기지 않은 객체 우선 선택.
- 잠긴 외부 객체를 우클릭 → Unlock으로 편집 재개.
- 전체 선택 상태에서도 잠긴 객체의 위치와 스타일 유지.
- 선택 전체를 복사하거나 슬라이드를 복제하면 잠금 상태도 복사.
- 잠금은 객체 편집 범위에 적용되며 슬라이드 삭제를 차단하지 않음.

선택 대상과 변경 대상을 분리해야 잠금 해제 경로를 유지하면서 겹친 객체를 다룰 수 있음. 복사본 배치는 좌표 변환이 필요하므로 저수준 이동 함수는 잠금 여부를 판단하지 않음.

- 근거: [canvas.js:3](../workspace/src/renderer/canvas.js), [properties.js:3](../workspace/src/renderer/properties.js).
- 결정: [객체 잠금은 선택과 변경을 분리](../knowledge/decisions/2026-09-locks-preserve-selection.md).

## 캔버스 렌더: 도형 마크업은 선택과 다른 도형에 의존하지 않음

- 캔버스는 레이어 셋을 DOM에 유지하고 도형의 키가 바뀐 `g`만 다시 그림.
- 도형 마크업에 들어가도 되는 것은 도형 자신, 텍스트 편집 중 글 숨김, 화면 배율뿐.
- 선택과 잠금은 `g`의 `sel`·`data-locked`로 매번 토글. 마크업에 넣으면 선택이 바뀔 때마다 그림을 다시 디코드함.
- 도형 마크업이 다른 도형(예: 겹침, 순서)에 의존하게 만들면 키가 그 변화를 못 보고 낡은 그림이 남음.
- 키를 바꾸는 입력은 키에도 반드시 반영. 배율이 키에 들어 있는 이유.

- 근거: [render.js:419](../workspace/src/renderer/render.js), [render.js:408](../workspace/src/renderer/render.js), [canvas.js:280](../workspace/src/renderer/canvas.js).
- 결정: [캔버스는 바뀐 도형만 고쳐 그리고 이동 중에는 프레임당 한 번 그림](../knowledge/decisions/2026-11-canvas-patches-only-changed-shapes.md).

확인 질문:

- 도형에 새 시각 요소를 더하면서 다른 도형의 상태를 읽는다면 낡은 그림이 남는 이유는?
- 선택된 도형만 테두리를 굵게 그리고 싶을 때 도형 마크업이 아니라 어디에 둬야 하는가?
- 같은 길이와 같은 앞뒤 32자를 가진 서로 다른 그림을 바꿔 넣으면 무엇이 보이고, 어떻게 해소하는가?

## 생성 기본값

- Settings → General에서 도형 채우기·글자 색상·도형 및 이미지 테두리 설정.
- 새 이미지의 테두리는 none이 기본값. 기존의 기본 검정 테두리 설정도 자동 전환.
- H1 제목·H2 부제목·H3 본문·H4 캡션의 크기를 Settings → General에서 지정.
- 텍스트를 선택한 뒤 Inspector → Text level에서 단계별 크기 적용. 직접 크기를 입력하면 Custom으로 표시.
- 테두리와 채우기의 none은 색상이 없는 상태.
- Arrow defaults에서 새 화살표의 Start end·Finish end 설정.
- 선과 펜은 끝 모양 없이 생성하고 Inspector에서 개별 변경.
- Inspector에서 바꾼 색상은 선택 객체에만 적용.
- 기존 객체·붙여넣기·프리셋은 자신이 가진 스타일 유지.
- 저장된 설정은 이후 생성하는 객체에 적용.

제목 단계는 텍스트 상자의 글자 크기 프리셋으로 적용됨. PPTX에는 결과 글자 크기를 저장하므로 다른 앱에서도 모양을 유지하고, 단계 이름은 문서에 별도로 기록하지 않음.

- 근거: [settings.js:139](../workspace/src/settings.js), [properties.js:130](../workspace/src/renderer/properties.js), [render.js:398](../workspace/src/renderer/render.js).

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

## 빈 도형 선택과 말풍선

- 채우기가 none이면 윤곽선 가까이 클릭해 선택.
- 빈 내부만 드래그하면 바깥 도형은 선택하지 않음.
- 회전한 도형과 원도 실제 윤곽선 위치로 드래그 선택 판정.
- 툴바의 Shapes → Speech bubble 또는 B → 캔버스 드래그로 말풍선 생성. 사각형·원·선·화살표·펜도 Shapes 팝오버에 모여 있고 단축키(R·O·L·A·P)는 그대로.
- 말풍선 선택 후 글자 입력 또는 윤곽선 더블클릭으로 텍스트 편집.
- 말풍선 꼬리도 도형 크기에 포함해 선택·리사이즈·회전 적용.
- PPTX에는 텍스트가 붙은 편집 가능한 사용자 도형으로 저장.
- Cmd++ / Cmd+=와 Cmd+-로 확대·축소, Cmd+0으로 화면 맞춤.

- 근거: [geometry.js:99](../workspace/src/editor/geometry.js), [svg.js:327](../workspace/src/editor/svg.js).

## PPTX 표와 SVG 아이콘

- PPTX의 표는 셀별 사각형으로 가져와 텍스트와 색상을 편집할 수 있음.
- 표 전용 행·열 추가와 셀 병합은 지원하지 않음.
- 둥근 사각형은 모서리 반경을 유지하며 다시 PPTX로 저장됨.
- 상단 Insert(클립) → Preset → Person icon에서 SVG 사람 아이콘 추가.
- SVG 이미지의 Inspector → SVG fill에서 색상 변경. Original colours 토글을 켜면 원본 색상 표시.
- SVG의 기존 채우기와 분리된 선 색상은 각각 편집. 색상 변경은 PPTX 저장본에도 반영.
- Finder의 이미지 파일을 슬라이드 위로 드롭하면 해당 위치에 이미지 추가. HTML 파일 드롭도 같은 이미지 생성 경로 사용.
- 드롭 위치가 슬라이드 밖이면 가져오지 않음. 이미지가 너무 크면 슬라이드의 80% 이내로 축소.
- 가져오는 이미지 파일은 최대 10 MB.

- 근거: [clipboard.js:109](../workspace/src/renderer/clipboard.js), [commands.rs:33](../workspace/src-tauri/src/commands.rs).

- 근거: [table.rs:28](../workspace/src-tauri/crates/deck/src/pptx/read/table.rs), [shapes.rs:664](../workspace/src-tauri/crates/deck/src/pptx/read/shapes.rs), [svg.js:42](../workspace/src/editor/svg.js), [files.js:86](../workspace/src/renderer/files.js).
- 결정: [PPTX 표는 셀별 도형으로 가져온다](../knowledge/decisions/2026-09-import-tables-as-cell-shapes.md).

## 정렬과 균등 분배

- 두 개 이상 선택하면 Align objects에 Left·Center·Right·Top·Middle·Bottom 표시.
- 기준은 선택 전체의 바깥 경계. Center는 그 경계의 가로 중앙, Middle은 세로 중앙.
- 세 개 이상 선택하면 Distribute 표시. 양 끝 객체는 고정하고 사이 객체만 옮겨 보이는 상자 사이 간격을 같게 맞춤.
- 회전한 객체는 회전 후 보이는 상자 기준.
- 정렬에서 잠긴 객체는 기준 계산에 포함되지만 움직이지 않음. 분배에서는 잠긴 객체를 빼고 나머지만으로 간격 계산. 포함하면 움직일 수 없는 객체가 간격 하나를 고정해 균등해지지 않음.

- 근거: [geometry.js:246](../workspace/src/editor/geometry.js).
- 결정: [도형 정렬과 자석은 보이는 바깥 경계를 사용](../knowledge/decisions/2026-08-shape-alignment-uses-visual-bounds.md).

## 툴바와 인스펙터

- 오른쪽 패널은 선택한 것을 보여줌. 아무것도 선택하지 않으면 Slide 섹션에서 배경 색상·프리셋·Apply to all slides 사용.
- 객체를 선택하면 헤더에 이름과 Duplicate·Lock/Unlock·Delete 아이콘 표시. 잠긴 객체에서도 Lock 버튼은 항상 활성.
- 툴바의 Insert(클립)에서 Image…, Code Block, Preset 실행. Image…는 붙여넣기와 같은 형식·10 MB 검사를 거침.
- 줌 캡슐을 더블클릭하면 100%로 복귀.
- 툴바 오른쪽 Inspector 버튼과 View → Inspector로 오른쪽 패널을 숨기거나 표시. 상태는 설정에 저장되고 AI 패널의 내용은 유지.
- 툴바 왼쪽에 파일 이름과 저장 안 된 변경 여부(Edited) 표시. 경로는 표시하지 않음.

- 근거: [render.js](../workspace/src/renderer/render.js)의 `renderProps`, [code.js](../workspace/src/renderer/code.js)의 Insert 메뉴, [properties.js](../workspace/src/renderer/properties.js)의 `toggleInspector`.
- 결정: [인스펙터는 선택을 따른다](../knowledge/decisions/2026-11-inspector-follows-selection.md).

## 텍스트 상자 크기

- 텍스트 상자를 선택하면 좌우 가장자리 중앙에 핸들 두 개만 표시.
- 핸들을 끌면 너비만 바뀌고 높이는 줄바꿈 결과에 맞춰 다시 계산. 글자 크기는 변하지 않음.
- 회전한 상자는 회전 방향에 맞춰 커서와 이동량이 돌아감.

- 근거: [geometry.js](../workspace/src/editor/geometry.js)의 `handlesFor`와 `resizeShape`.
- 결정: [텍스트 상자 높이는 글이 정한다](../knowledge/decisions/2026-09-text-boxes-are-as-tall-as-their-text.md).

## 영역 선택과 선택 이동

- 영역 드래그는 잠긴 객체를 건너뜀. 잠긴 배경은 클릭으로만 선택.
- 드래그하는 동안 선택이 바로 갱신되어 놓기 전에 결과 확인.
- Alt를 누른 채 드래그하면 영역 안에 완전히 들어온 객체만 선택. 테두리가 점선으로 바뀜.
- 큰 객체 위의 작은 객체는 Alt 드래그로 큰 객체 없이 선택.
- 영역에 걸린 객체가 그룹이면 그룹 전체 선택.
- 슬라이드 바깥 회색 여백에서 드래그를 시작해도 영역 선택.
- Alt+클릭은 겹친 객체 중 현재 선택 바로 아래의 잠기지 않은 객체를 선택. 맨 아래에서는 맨 위로 순환. 이 방식으로 선택한 객체도 바로 드래그 가능.
- 캔버스에 포커스가 있을 때 Tab / Shift+Tab으로 z 순서대로 다음·이전 객체 선택. 양 끝을 넘으면 선택을 해제하고 포커스가 캔버스 밖으로 이동.

- 근거: [geometry.js:163](../workspace/src/editor/geometry.js), [canvas.js:48](../workspace/src/renderer/canvas.js), [canvas.js:64](../workspace/src/renderer/canvas.js), [canvas.js:18](../workspace/src/renderer/canvas.js), [text.js:284](../workspace/src/renderer/text.js).
- 결정: [영역 선택은 잠긴 객체를 건너뛰고 드래그 중 실시간으로 반영](../knowledge/decisions/2026-11-area-selection-skips-locked-and-previews-live.md).

## 표 삽입

- 툴바 Table → 8 × 6 격자에서 크기를 고르면 열 × 행이 캡션에 표시. 클릭이나 Enter로 삽입, 방향키로 격자 이동.
- 표는 슬라이드 중앙에 가로 70%로 생성. 행 높이는 H3 글자 크기의 1.6배와 슬라이드 높이의 1/14 중 큰 값이며, 표 전체는 슬라이드 높이의 80%를 넘지 않음.
- 각 셀은 하나의 그룹으로 묶인 흰색 사각형. 클릭하면 표 전체가 선택되고 같은 셀을 한 번 더 누르면 그 셀의 글 편집.
- 이동·복제·삭제는 그룹 단위. 우클릭 Ungroup으로 셀을 개별 도형으로 분리.
- 행·열 추가와 삭제, 표 전체 크기 조절은 없음.
- 삽입은 undo 한 번으로 표 전체를 제거.
- PPTX 저장에는 그룹으로 기록되지만 다시 열면 그룹이 풀려 셀이 독립 사각형으로 열림.

- 근거: [geometry.js:337](../workspace/src/editor/geometry.js)의 `createTableShapes`, [code.js:151](../workspace/src/renderer/code.js)의 `insertTable`.
- 결정: [새로 만드는 표는 그룹으로 묶은 셀 도형](../knowledge/decisions/2026-11-created-tables-are-grouped-cell-shapes.md).

## 댓글

- 객체 하나에 댓글 하나. 작성자·로그인·스레드는 없음.
- 툴바의 Comments 버튼, View → Comments, 객체 우클릭 → Add Comment / Edit Comment로 켜고 편집. 버튼을 켤 때 잠기지 않은 객체가 하나만 선택돼 있으면 그 객체의 편집창이 바로 열림.
- 댓글이 있는 객체는 왼쪽 위 바깥에 18px 배지 표시. 크기는 줌과 무관하고, 슬라이드 배경이 밝으면 호박색, 어두우면 노란색에 흰 테두리.
- 배지를 누르면 그 객체를 선택하고 편집창을 엶. 같은 배지를 다시 누르면 닫힘. 배지 위에서 시작한 드래그는 영역 선택도 객체 이동도 시작하지 않음.
- Done·바깥 클릭·Cmd/Ctrl+Enter로 저장, Esc로 취소. 저장은 undo 한 번. 내용을 비우면 댓글 삭제.
- 잠긴 객체의 댓글은 읽을 수만 있고 수정·삭제 불가.
- 이동·복제·복사·붙여넣기·그룹·undo에서 객체를 따라다님. 프리셋 저장에서는 제외.
- 썸네일·발표 모드·PDF·PNG·AI 패널로 보내는 슬라이드 그림에는 나타나지 않음. 모두 `renderSlideSvg`로 그리고 배지는 `renderCanvas`만 그리기 때문.
- PPTX에는 표준 댓글(`commentAuthors.xml`, `comments/commentN.xml`)로 저장. 작성자는 고정 이름 Comment 하나, 시각은 고정값이라 사용자나 저장 시각이 파일에 남지 않음.
- 위치는 객체 왼쪽 위(1/576인치 단위, 1px = 6)로 기록하고, 열 때 왼쪽 위 모서리가 2px 이내인 첫 번째 댓글 없는 객체에 붙임. 외부 파일의 댓글은 그 점을 포함한 가장 위 객체에 붙이고, 붙일 곳이 없으면 버림.

한계:

- 왼쪽 위 모서리가 2px 이내로 겹치는 객체 둘 중 뒤의 객체만 댓글이 있으면, 열 때 앞의 객체에 붙음. 표준 댓글에 객체 id가 없기 때문.
- 객체 하나에 댓글 하나뿐이며 서식과 답글은 없음.
- 깨진 댓글 부품은 파일 열기를 막지 않고 건너뜀.

- 근거: [comments.js:52](../workspace/src/renderer/comments.js), [comments.js:97](../workspace/src/renderer/comments.js), [canvas.js:86](../workspace/src/renderer/canvas.js), [comments.rs:22](../workspace/src-tauri/crates/deck/src/pptx/comments.rs), [comments.rs:170](../workspace/src-tauri/crates/deck/src/pptx/comments.rs).
- 결정: [댓글은 도형에 속한다](../knowledge/decisions/2026-11-comments-belong-to-shapes.md).

## 그림 배경 제거

- 래스터 그림(PNG·JPEG·WebP·GIF·BMP)을 우클릭 → Remove Background. SVG 그림과 잠긴 그림에는 항목이 없음.
- 그림 테두리 한 줄에서 가장 많은 색을 배경으로 추정. 그 색과 비슷하고 테두리에서 이어진 영역만 투명하게 만듦. 피사체에 둘러싸인 같은 색 영역은 그대로 남음.
- 경계 한 줄은 배경이 섞인 정도를 계산해 반투명으로 만들고 배경색 성분을 뺌.
- 크롭·크기·회전·댓글은 그대로. 결과는 PNG로 저장되고 undo 한 번이 원본을 복원.
- 배경이 이미 투명하면 아무것도 바꾸지 않고 상태 줄에 안내.
- 긴 변이 4096px를 넘으면 그 크기로 줄여 처리.

한계:

- 단색이거나 완만한 그러데이션이 테두리에 닿은 배경만 지움. 피사체 분리가 아님.
- 피사체와 배경 색이 비슷하면 피사체도 지워짐. 복잡한 배경은 거의 지워지지 않음.
- 완만하다는 기준은 추정 배경색에서 채널당 약 12 이내(색 거리 허용치 36). 그보다 벗어나는 그러데이션은 일부만 지워짐.

- 근거: [matte.js:79](../workspace/src/editor/matte.js), [background-removal.js:44](../workspace/src/renderer/background-removal.js).
- 결정: [그림 배경 제거는 테두리 기준 영역 채우기](../knowledge/decisions/2026-11-background-removal-is-border-flood-fill.md).

## 확인 질문

1. 잠긴 객체를 선택할 수 있어야 하는 이유는 무엇인가?
2. 전체 선택 후 색상을 바꾸면 잠긴 객체에도 적용되는가?
3. H1 크기를 바꾸면 이미 만든 텍스트도 바뀌는가?
4. 코드 블록의 리사이즈와 Crop은 어떻게 다른가?
5. 슬라이드 밖으로 드롭한 이미지는 어떻게 처리되는가?
6. 균등 분배에서 양 끝 객체를 움직이지 않는 이유는 무엇인가?
7. 영역 드래그가 잠긴 배경을 선택하지 않는 이유는 무엇인가?
8. Alt 드래그와 Alt+클릭은 각각 무엇을 선택하는가?
9. 만든 표의 셀을 채우지 않으면 셀 글 편집이 막히는 이유는 무엇인가?
10. 댓글이 썸네일과 PDF에 나타나지 않는 구조적 이유는 무엇인가?
11. 표준 댓글을 열 때 어떤 객체에 붙이며, 어떤 경우에 틀린 객체에 붙을 수 있는가?
12. 그림의 흰 배경 안에 갇힌 흰 영역이 지워지지 않는 이유는 무엇인가?
