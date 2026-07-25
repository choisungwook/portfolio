# akbun-shadowing-player Agent Guide

언어 공부(쉐도잉)용 구간 반복 오디오 플레이어. TypeScript + Electron, macOS 전용 빌드. 저장소 전체 규칙은 [루트 AGENTS.md](../../AGENTS.md), 의사결정은 [knowledge/](./knowledge/index.md), 구조 설명은 [wiki/](./wiki/architecture.md)에 있다.

## 기능 범위

쉐도잉 학습 기능만 유지한다: 파일·폴더 불러오기, 파형 화면, 재생 컨트롤(배속·±5초), A-B 구간 반복, 설정(테마), 업데이트 확인. 범용 음악 플레이어(플레이리스트, 태그, 스트리밍)로 확장하지 않는다.

## 디렉터리

| 경로 | 역할 |
|---|---|
| src/main | 메인 프로세스: main.ts, library.ts(목록 영속), preload.ts, logger.ts, update.ts |
| src/renderer | 렌더러 UI: waveform.ts(파형 캔버스), renderer.ts(화면 전환·컨트롤) |
| static | index.html, style.css |
| test | node:test 검증 (plain JS, dist/를 읽음) |

## 명령어

빌드, 테스트, 실행, 패키징 순서다.

```bash
cd product/akbun-shadowing-player
npm install
npm run build
npm test
npm start
npm run dist    # release/에 dmg 생성
```

## 아키텍처 제약

- **renderer는 모듈이 아니다.** import/export 금지. index.html이 waveform.js → renderer.js 순서로 전역 script를 로드한다. [ADR](./knowledge/decisions/2026-07-plain-tsc-script-renderer.md)
- **main↔renderer 타입은 수동 동기화.** IPC 채널을 추가하면 preload.ts와 src/renderer/api.d.ts를 함께 고친다.
- **재생과 파형은 경로가 다르다.** 재생은 HTMLAudioElement(preservesPitch), 파형은 Web Audio decode. 합치면 배속 시 음정이 변하므로 합치지 않는다. [ADR](./knowledge/decisions/2026-07-html-audio-plus-webaudio-split.md)
- **화면 섹션 표시는 hidden 속성으로 제어한다.** 섹션을 추가하면 style.css의 `[hidden] { display: none }` 규칙에 선택자를 추가한다.
- **테마 색은 style.css :root 변수 한 곳에만 둔다.** `light-dark()` 사용. 예외는 `--wave-*` — canvas가 getComputedStyle로 읽으므로 선택자별로 값을 나눈다. 테마 변경 시 `waveform.refreshColors()` 호출.
- **업데이트는 dmg를 받아 .app 번들을 통째로 교체한다.** 무서명이라 electron-updater를 못 쓴다. detached 스크립트가 종료 후 교체·재실행하고 실패 시 되돌린다. [ADR](./knowledge/decisions/2026-07-update-download-and-swap.md)
- **로그는 app.getPath("logs")의 main.log에 쓴다.** 1MB 초과 시 rotation. 렌더러 오류는 log:error 채널로 main에 보낸다.

## 테스트

node:test 내장 러너만 쓴다. 현재 대상은 업데이트의 임시 파일 정리다. **업데이트 관련 코드(update.ts, main.ts의 installUpdate)를 고치면 npm test로 확인한다.** 교체 스크립트 테스트는 hdiutil이 없는 ubuntu 러너에서도 동작한다.

## CI와 릴리스

.github/workflows/release-akbun-shadowing-player.yml이 담당한다.

- PR: ubuntu에서 npm test (electron 바이너리 다운로드 생략).
- master push: macos에서 dmg(arm64) 빌드 → package.json version으로 akbun-shadowing-player-v{버전} tag → dmg 첨부 GitHub Release. 빌드 실패 시 빈 release가 남지 않는 순서다. [ADR](../../knowledge/decisions/2026-07-build-before-tag-and-release.md)
- 버전의 유일한 출처는 package.json의 version이다. **코드를 수정하면 마이너 버전을 +1 한다** (예: 0.7.0 -> 0.8.0). 올리지 않으면 기존 tag push에 실패해 release가 안 만들어진다. 문서만 고친 경우는 올리지 않는다.

## 주의사항

- lock 파일을 커밋하지 않는다 (루트 .gitignore). release/도 커밋하지 않는다.
- electron postinstall이 막히면 node node_modules/electron/install.js를 직접 실행한다.
- dmg는 무서명이다. [무서명 배포 결정](../hprof-oom-analyzer/knowledge/decisions/2026-07-unsigned-mac-distribution.md)
- 파형 조작 동작을 바꾸면 [wiki/waveform-interaction.md](./wiki/waveform-interaction.md)를 같이 고친다.
