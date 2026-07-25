# akbun-shadowing-player Agent Guide

언어 공부(쉐도잉)용 구간 반복 오디오 플레이어다. TypeScript + Electron이고 macOS만 빌드한다. 이 파일은 이 디렉터리에서 작업하는 agent의 진입점이다. 저장소 전체 규칙은 [루트 AGENTS.md](../../AGENTS.md)를 따르고, 의사결정은 [knowledge/](./knowledge/index.md)에, 구조와 동작 설명은 [wiki/](./wiki/architecture.md)에 있다.

## 기능 범위

쉐도잉 학습에 쓰는 기능만 유지한다. 범용 음악 플레이어(플레이리스트, 태그, 스트리밍)로 확장하지 않는다.

1. 음성 파일·폴더 불러오기와 목록 관리 (userData/library.json에 영속)
2. 파형 화면: 드래그 스크롤, 클릭 재생, 확대/축소
3. 재생 컨트롤: 재생/일시정지, 배속(음정 유지), ±5초
4. 구간 반복(A-B)
5. 설정 화면: 테마(시스템/라이트/다크), 저장 위치 표시
6. 상단 메뉴에서 GitHub Release 최신 버전 확인

## 디렉터리

| 경로 | 역할 |
|---|---|
| src/main | Electron 메인 프로세스(main.ts, 창·상단 메뉴·IPC), 파일 목록 영속(library.ts), preload 브리지(preload.ts), 파일 로거(logger.ts), 업데이트 확인(update.ts) |
| src/renderer | 렌더러 UI. waveform.ts(파형 캔버스) + renderer.ts(화면 전환·컨트롤). import/export 없는 script로만 작성한다 |
| static | index.html, style.css. script 태그가 dist/renderer/*.js를 로드 순서대로 읽는다 |
| test | node:test로 도는 검증. dist/를 읽는 plain JS라 별도 tsconfig가 없다 |
| wiki | 구조·동작 설명 문서 |
| knowledge | 이 프로젝트의 OKF 지식 번들 (ADR) |

## 명령어

빌드, 실행, 패키징 순서다.

```bash
cd product/akbun-shadowing-player
npm install
npm run build   # tsc -p tsconfig.json && tsc -p tsconfig.renderer.json
npm test        # build 후 node --test로 test/*.test.js 실행
npm start       # Electron GUI
npm run dist    # electron-builder --mac, release/에 dmg 생성
```

## 아키텍처 제약

- **renderer는 모듈이 아니다.** import/export를 쓰지 않는다. tsconfig.renderer.json은 module: es2022지만 각 파일에 import/export가 없어 전역 script로 컴파일되고, index.html이 waveform.js → renderer.js 순서로 로드한다. TypeScript 7이 module: none을 제거해서 es2022를 쓴다. [ADR](./knowledge/decisions/2026-07-plain-tsc-script-renderer.md) 참조.
- **main↔renderer 타입은 수동 동기화한다.** src/renderer/api.d.ts의 전역 선언을 main.ts IPC 핸들러 반환 형태와 손으로 맞춘다.
- **재생과 파형은 경로가 다르다.** 재생은 HTMLAudioElement(blob URL, preservesPitch로 배속 시 음정 유지), 파형은 Web Audio decodeAudioData로 뽑은 peak다. AudioBufferSourceNode로 재생을 합치면 배속 시 음정이 변하므로 합치지 않는다. [ADR](./knowledge/decisions/2026-07-html-audio-plus-webaudio-split.md) 참조.
- **IPC 채널은 9개다.** library:list, library:add, library:add-folder, library:remove, library:set-duration, app:info, app:reveal, audio:read, log:error. 여기에 main→renderer 단방향 menu 채널이 하나 더 있다. 채널을 추가하면 preload.ts와 api.d.ts를 함께 고친다.
- **화면 섹션의 표시/숨김은 hidden 속성으로 제어한다.** #home-screen, #player-screen, #settings-screen은 CSS에서 display: flex를 지정하므로, style.css의 `#home-screen[hidden], #player-screen[hidden], #settings-screen[hidden] { display: none }` 규칙이 없으면 hidden 속성이 무시된다. 화면 섹션을 추가하면 이 규칙에도 선택자를 추가한다.
- **테마 색은 style.css의 :root 변수 한 곳에만 둔다.** 라이트/다크는 `light-dark()`로 함께 쓰고, `html[data-theme]`(light/dark)가 있으면 그 값을, 없으면 시스템 설정을 따른다. 예외는 `--wave-*` 변수다. canvas는 CSS를 못 쓰므로 waveform.ts가 getComputedStyle로 읽어 가는데, 등록하지 않은 custom property는 `light-dark()`가 해석되지 않은 채 문자열로 나온다. 그래서 `--wave-*`만 선택자(:root / prefers-color-scheme / [data-theme])로 값을 나눠 쓴다. 테마가 바뀌면 renderer.ts가 `waveform.refreshColors()`로 캐시한 색을 다시 읽는다.
- **업데이트는 dmg를 받아 .app 번들을 통째로 교체한다.** update.ts가 GitHub Releases API에서 akbun-shadowing-player-v* tag의 최신 release를 찾아 버전을 비교하고, 새 버전이면 아키텍처에 맞는 dmg를 fetch로 받는다(arm64만 파일명에 -arm64가 붙는다). 실행 중인 앱은 자기 번들을 덮어쓸 수 없으므로, 앱 밖에서 도는 detached bash 스크립트가 종료를 기다렸다가 교체하고 재실행한다. 실패하면 옮겨 둔 이전 번들을 되돌린다. 무서명이라 electron-updater(Squirrel.Mac)는 쓸 수 없지만, 앱이 fetch로 받은 파일에는 quarantine이 붙지 않아 Gatekeeper 검사를 거치지 않는다. 개발 모드(app.isPackaged가 false)에서는 교체 대상이 Electron.app이라 설치를 막는다. [ADR](./knowledge/decisions/2026-07-update-download-and-swap.md) 참조.
- **로그는 ~/Library/Logs/akbun-shadowing-player/main.log에 쓴다.** macOS 사용자 로그 관례 위치(app.getPath("logs"))다. 1MB를 넘으면 main.log.1~5로 rotation한다. 렌더러 오류는 log:error 채널로 main에 보내 같은 파일에 남긴다.

## 테스트

test/에 node:test로 도는 검증이 있다. 프레임워크를 넣지 않고 Node 내장 러너만 쓴다. 모든 코드를 덮지 않고, 손으로 확인하기 어렵고 조용히 망가지는 곳만 남긴다.

현재 대상은 업데이트의 임시 파일 정리다. 100MB가 넘는 dmg를 다루고 정리 지점이 세 곳(교체 스크립트의 trap, 스크립트 실행 전 실패, 앱 시작 때 남은 디렉터리 청소)이라 하나가 빠져도 눈에 띄지 않는다. **업데이트 관련 코드(update.ts, main.ts의 installUpdate)를 고치면 npm test로 확인한다.** PR에서 CI가 같은 명령을 돌린다.

교체 스크립트 테스트는 hdiutil이 없는 ubuntu 러너에서도 동작한다. attach 단계에서 실패하는 것이 검증 대상인 실패 경로이기 때문이다.

## CI와 릴리스

.github/workflows/release-akbun-shadowing-player.yml이 담당한다.

- PR: ubuntu에서 npm test로 tsc 컴파일과 테스트를 검증한다 (electron 바이너리 다운로드 생략).
- master push: macos-latest에서 dmg(arm64)를 빌드하고, 빌드가 성공하면 기존 tag 중 가장 최근 버전의 마이너를 +1 한 akbun-shadowing-player-v{버전} tag를 만들고, tag push가 성공하면 dmg를 첨부한 GitHub Release를 만든다. 예전 prefix(shadowing-player-v*)의 tag도 이전 버전으로 인정한다.
- 빌드 -> tag -> release 순서는 빌드가 실패했을 때 빈 release가 남지 않게 하려는 것이다. [ADR](../../knowledge/decisions/2026-07-build-before-tag-and-release.md) 참조.
- 버전은 tag에서 자동 계산하므로 package.json의 version은 릴리스에 쓰지 않는다. 빌드 전에 npm version으로 계산된 버전을 주입해 dmg 파일명에 반영한다.

## 주의사항

- 저장소 루트 .gitignore가 package-lock.json, dist, node_modules를 제외한다. lock 파일을 커밋하지 않는다. release/는 이 디렉터리의 .gitignore가 제외한다.
- npm install 시 allow-scripts 정책으로 electron 바이너리 다운로드(postinstall)가 막힐 수 있다. 그때는 node node_modules/electron/install.js를 직접 실행한다.
- macOS 서명 identity가 없어 dmg는 무서명으로 만든다. hprof-oom-analyzer의 [무서명 배포 결정](../hprof-oom-analyzer/knowledge/decisions/2026-07-unsigned-mac-distribution.md)과 같은 이유다.
- 파형 조작(클릭 vs 드래그 판정, 자동 스크롤, A-B 반복)의 동작 규칙은 [wiki/waveform-interaction.md](./wiki/waveform-interaction.md)에 정의되어 있다. 동작을 바꾸면 이 문서를 같이 고친다.
