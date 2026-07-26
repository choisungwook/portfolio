# akbun-PPTEditorFromHTML Agent Guide

akbun-studysheet HTML 학습지를 PowerPoint처럼 편집하는 데스크톱 에디터. TypeScript + Electron, macOS 전용 빌드. 저장소 전체 규칙은 [루트 AGENTS.md](../../AGENTS.md), 의사결정은 [knowledge/](./knowledge/index.md), 구조 설명은 [wiki/](./wiki/architecture.md)에 있다.

## 이 제품이 풀려는 문제

akbun-studysheet skill이 만드는 학습지는 단일 HTML 파일(외부 의존성 없음, 퀴즈·페이지 넘김 JS 내장)이다. 이 파일을 만들어진 뒤에 고치려면 HTML을 직접 편집해야 했다. 이 앱은 학습지를 한 번 임포트하면 모든 요소를 드래그 이동·리사이즈·제자리 텍스트 편집할 수 있게 하고, 편집 결과를 **인터랙션이 살아 있는 학습지 HTML로 다시 내보낸다**.

## 핵심 의사결정 (전부 ADR로 기록됨)

- **모델 우선(model-first).** 진실의 원본은 JSON 모델이고 HTML은 export 산출물이다. DOM 직접 편집·Figma/PowerPoint 변환 대안을 검토한 끝에 선택했다. 이유: 인터랙티브 HTML 학습지를 유지해야 한다는 요구는 자체 에디터로만 충족된다. [ADR](./knowledge/decisions/2026-07-model-first-json-source.md)
- **고정 논리 해상도 캔버스.** 슬라이드는 1280x720 논리 px에서 한 번 레이아웃되고 화면에는 scale/zoom으로 맞춘다. iframe 스테이지 1차 구현을 폐기하고 Shadow DOM 캔버스로 바꿨다. [ADR](./knowledge/decisions/2026-07-fixed-design-resolution-canvas.md)
- **임포트는 측정-동결.** DOMParser + 오프스크린 캔버스에서 원본 flow 레이아웃의 좌표를 재서 %로 얼린다. 임포트는 최초 1회다. [ADR](./knowledge/decisions/2026-07-import-measure-freeze.md)
- **shell 보존 export.** 원본의 style/script/nav를 그대로 남기고 페이지 내용만 토큰 치환한다. export 결과에서 퀴즈·페이지 넘김이 동작하는 이유다. [ADR](./knowledge/decisions/2026-07-shell-preserve-export.md)
- **배포·업데이트·렌더러·버전 관리.** 무서명 arm64 dmg, dmg 교체 방식 자체 업데이트, 순수 tsc + 전역 script 렌더러, package.json 단일 버전 출처. [ADR](./knowledge/decisions/2026-07-release-update-renderer-conventions.md)

## 디렉터리

| 경로 | 역할 |
|---|---|
| src/main | 메인 프로세스: main.ts, store.ts(문서 JSON 영속), preload.ts, update.ts |
| src/renderer | 렌더러: importer.ts(HTML→모델·캔버스 공통부), exporter.ts(모델→HTML), editor.ts(편집 스테이지), renderer.ts(앱 셸) |
| static | index.html, style.css |
| test | node:test 검증 (plain JS, dist/를 읽음) |

## 명령어

빌드, 테스트, 실행, 패키징 순서다.

```bash
cd product/akbun-PPTEditorFromHTML
npm install
npm run build
npm test
npm start
npm run dist    # release/에 dmg 생성
```

## 아키텍처 제약

- **renderer는 모듈이 아니다.** import/export 금지. index.html이 importer.js → exporter.js → editor.js → renderer.js 순서로 전역 script를 로드한다. 함수·상수가 파일 간 전역으로 공유된다.
- **main↔renderer 타입은 수동 동기화.** IPC 채널을 추가하면 preload.ts와 src/renderer/api.d.ts를 함께 고친다.
- **편집·측정 캔버스에 iframe을 쓰지 않는다.** Shadow DOM으로 스타일을 격리하고, 학습지 CSS의 html/body/:root 선택자는 .ppte-canvas로 재작성한다. @media 규칙은 제거한다 — 창 크기가 측정·표시를 흔들면 안 된다.
- **문서 root 글씨 크기는 24.48px로 고정된다**(pinRootFontSize). 학습지 CSS의 rem이 논리 해상도 기준으로 풀리게 하기 위함이다. 앱 UI CSS는 rem을 쓰지 말고 px만 쓴다.
- **모든 편집은 모델을 고치고 화면은 결과다.** DOM에서 읽어 모델을 만드는 방향은 텍스트 편집 커밋(contenteditable innerHTML) 한 곳뿐이다.
- **화면 섹션 표시는 hidden 속성으로 제어한다.** section#home/#editor의 display:flex가 UA의 [hidden] 규칙을 덮으므로, 섹션을 추가하면 style.css의 `section#...[hidden] { display: none }` 선택자에 함께 추가한다.
- **테마 색은 style.css :root 변수 한 곳에만 둔다.** light 기본 + prefers-color-scheme dark 덮어쓰기.
- **업데이트는 dmg를 받아 .app 번들을 통째로 교체한다.** 무서명이라 electron-updater를 못 쓴다. src/main/update.ts가 detached 스크립트로 교체를 수행한다.

## 테스트

node:test 내장 러너만 쓴다. **업데이트 관련 코드(update.ts, main.ts의 installUpdate)를 고치면 npm test로 확인한다.** exporter의 문자열 로직(토큰 치환, 좌표 style)은 vm으로 전역 script를 실행해 검증한다. 렌더링·측정(importer, editor)은 브라우저가 필요해 자동 테스트가 없다 — 고치면 npm start로 임포트→편집→export를 눈으로 확인한다.

## CI와 릴리스

.github/workflows/release-akbun-ppteditorfromhtml.yml이 담당한다.

- PR: ubuntu에서 npm test (electron 바이너리 다운로드 생략).
- master push: macos에서 dmg(arm64) 빌드 → package.json version으로 akbun-PPTEditorFromHTML-v{버전} tag → dmg 첨부 GitHub Release. 빌드 실패 시 빈 release가 남지 않는 순서다.
- 버전의 유일한 출처는 package.json의 version이다. **코드를 수정하면 마이너 버전을 +1 한다** (예: 0.1.0 -> 0.2.0). 올리지 않으면 기존 tag push에 실패해 release가 안 만들어진다. 문서만 고친 경우는 올리지 않는다.

## 로드맵 (다음 세션이 이어받을 일)

PR이 merge되면 세션이 끝나므로 남은 일을 여기에 둔다. 항목을 끝내면 지우고, 새 계획이 생기면 추가한다.

### v0.2

- [ ] 객체 추가: 텍스트 상자, 다이어그램 상자(.dbox), 화살표(.darrow)
- [ ] 객체 삭제(Delete 키)·복제
- [ ] 페이지 추가(빈 페이지·템플릿 페이지)·삭제·순서 변경
- [ ] undo/redo (모델 스냅샷 스택 — 모델 우선이라 JSON.stringify 스냅샷이면 충분)

### v0.3

- [ ] 퀴즈 전용 편집 UI: 보기 추가/삭제, 정답(data-answer) 변경, 피드백 문구 수정
- [ ] pptx export (pptxgenjs로 모델에서 직접 생성)
- [ ] 페이지 목록에 시각 썸네일

## 주의사항

- release/는 커밋하지 않는다.
- 앱 아이콘이 아직 없다(기본 Electron 아이콘). assets/icon.png를 만들면 package.json build.directories.buildResources를 assets로 지정한다.
- electron postinstall이 막히면 node node_modules/electron/install.js를 직접 실행한다.
- dmg는 무서명이다. 처음 실행 오류는 xattr -cr로 푼다. [배포 결정](./knowledge/decisions/2026-07-release-update-renderer-conventions.md)
- 편집된 학습지는 16:9 고정이다. 원본 템플릿의 좁은 화면 세로 읽기 모드와 인쇄 펼침은 절대좌표화 과정에서 포기했다(고정 해상도 ADR의 대가 항목 참조).
