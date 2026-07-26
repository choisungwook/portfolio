# 아키텍처

Electron 표준 3분할(main, preload, renderer) 구조다. 메인 프로세스는 창 생성·파일 대화상자·문서 JSON 영속·업데이트만 하고, 임포트 측정·편집·export 생성은 전부 렌더러가 한다.

## 문서 생애주기

학습지 HTML이 들어와 편집되고 다시 나가는 흐름이다.

홈 화면은 akbun-shadowing-player와 같은 구조다: 학습지 HTML 불러오기(다중 선택)·폴더 불러오기·새로고침·전체 삭제 버튼과 문서 목록이 있고, 문서를 클릭하면 편집 화면으로 넘어간다. 폴더 불러오기가 섞어 온 학습지 형식이 아닌 HTML은 임포트에서 건너뛰고 개수를 알린다.

```text
[renderer] import:html / import:folder 요청 → main이 대화상자 → [{path, html}] 반환
[renderer] importStudysheet:
           DOMParser 파싱(스크립트 실행 없음)
           → 오프스크린 Shadow DOM 캔버스에 1280x720으로 렌더
           → 페이지 직계 자식마다 getBoundingClientRect → % 좌표 동결
           → 페이지 내용을 <!--PPTE:PAGE:i--> 토큰으로 바꾼 shellHtml 생성
           → SheetDoc { title, sourcePath, shellHtml, pages[objects] }
[main]     doc:save → ~/Documents/akbun-PPTEditorFromHTML/<이름>.json  (진실의 원본)
[renderer] 편집: 모든 조작이 모델을 고치고 스테이지는 재렌더 → 0.5초 디바운스 자동 저장
[renderer] exportStudysheet: shellHtml의 토큰을 절대좌표 객체로 치환한 문자열
[main]     export:html → 저장 대화상자(기본값: 원본 경로) → 파일 쓰기
```

export 결과는 원본의 CSS/JS(퀴즈, 페이지 넘김, stepper, 전체 화면)가 그대로 남은 단독 HTML이고, 주입된 fit 스크립트가 고정 1280x720 슬라이드를 창 크기에 zoom으로 맞춘다.

## 편집 스테이지

스테이지는 iframe이 아니라 앱 문서 안의 Shadow DOM 캔버스다.

- 학습지 CSS는 html/body/:root → .ppte-canvas로 재작성하고 @media 규칙을 제거해 주입한다.
- 슬라이드는 1280x720 논리 px로 그리고 transform: scale로 컨테이너에 맞춘다. 마우스 이동량은 scale로 나눠 논리 px로 환산한다.
- 객체(.ppte-obj wrapper)는 position:absolute + left/top/width %. 클릭 선택, 드래그 이동, 오른쪽 아래 핸들 리사이즈, 더블클릭 contenteditable 텍스트 편집.
- 텍스트 편집 커밋은 스테이지 밖 조작(페이지 전환·export·창 리사이즈) 전에 stageFlush()로 보장한다.

## IPC 채널

| 채널 | 방향 | 역할 |
|---|---|---|
| doc:list | renderer → main | 저장된 문서 목록 조회 |
| doc:load | renderer → main | 문서 JSON 읽기 |
| doc:save | renderer → main | 문서 JSON 쓰기 (자동 저장) |
| doc:remove | renderer → main | 문서 삭제 |
| doc:remove-all | renderer → main | 모든 문서 삭제 |
| import:html | renderer → main | 학습지 HTML 선택(다중) 대화상자 + 원문 읽기 |
| import:folder | renderer → main | 폴더 선택 + 재귀 스캔한 HTML 원문 읽기 |
| export:html | renderer → main | 저장 대화상자 + export HTML 쓰기 |
| app:info | renderer → main | 버전·문서 저장 경로 |
| menu | main → renderer | 상단 메뉴 선택(import/export) 알림 |

채널을 추가하면 main.ts(핸들러), preload.ts(브리지), api.d.ts(타입)를 함께 고친다.

## 렌더러 스크립트 로드 순서

renderer는 모듈이 아니다. index.html이 전역 script로 순서대로 로드하고, 앞 파일의 함수·상수를 뒤 파일이 그대로 쓴다.

```text
importer.js   DESIGN_W/H, buildCanvas, collectCanvasCss, importStudysheet, pinRootFontSize
exporter.js   objectWrapper, pageInnerHtml, exportStudysheet
editor.js     stageRender, stageFlush (전역 stage 상태)
renderer.js   화면 전환, 문서 목록, 페이지 목록, 자동 저장, 메뉴 배선
```
