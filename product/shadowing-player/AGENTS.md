# shadowing-player Agent Guide

언어 공부(쉐도잉)용 구간 반복 오디오 플레이어다. TypeScript + Electron이고 macOS만 빌드한다. 이 파일은 이 디렉터리에서 작업하는 agent의 진입점이다. 저장소 전체 규칙은 [루트 AGENTS.md](../../AGENTS.md)를 따르고, 의사결정은 [knowledge/](./knowledge/index.md)에, 구조와 동작 설명은 [wiki/](./wiki/architecture.md)에 있다.

## 기능 범위

쉐도잉 학습에 쓰는 기능만 유지한다. 범용 음악 플레이어(플레이리스트, 태그, 스트리밍)로 확장하지 않는다.

1. 음성 파일 불러오기와 목록 관리 (userData/library.json에 영속)
2. 파형 화면: 드래그 스크롤, 클릭 재생, 확대/축소
3. 재생 컨트롤: 재생/일시정지, 배속(음정 유지), ±5초
4. 구간 반복(A-B)

## 디렉터리

| 경로 | 역할 |
|---|---|
| src/main | Electron 메인 프로세스(main.ts), 파일 목록 영속(library.ts), preload 브리지(preload.ts) |
| src/renderer | 렌더러 UI. waveform.ts(파형 캔버스) + renderer.ts(화면 전환·컨트롤). import/export 없는 script로만 작성한다 |
| static | index.html, style.css. script 태그가 dist/renderer/*.js를 로드 순서대로 읽는다 |
| wiki | 구조·동작 설명 문서 |
| knowledge | 이 프로젝트의 OKF 지식 번들 (ADR) |

## 명령어

빌드, 실행, 패키징 순서다.

```bash
cd product/shadowing-player
npm install
npm run build   # tsc -p tsconfig.json && tsc -p tsconfig.renderer.json
npm start       # Electron GUI
npm run dist    # electron-builder --mac, release/에 dmg 생성
```

## 아키텍처 제약

- **renderer는 모듈이 아니다.** import/export를 쓰지 않는다. tsconfig.renderer.json은 module: es2022지만 각 파일에 import/export가 없어 전역 script로 컴파일되고, index.html이 waveform.js → renderer.js 순서로 로드한다. TypeScript 7이 module: none을 제거해서 es2022를 쓴다. [ADR](./knowledge/decisions/2026-07-plain-tsc-script-renderer.md) 참조.
- **main↔renderer 타입은 수동 동기화한다.** src/renderer/api.d.ts의 전역 선언을 main.ts IPC 핸들러 반환 형태와 손으로 맞춘다.
- **재생과 파형은 경로가 다르다.** 재생은 HTMLAudioElement(blob URL, preservesPitch로 배속 시 음정 유지), 파형은 Web Audio decodeAudioData로 뽑은 peak다. AudioBufferSourceNode로 재생을 합치면 배속 시 음정이 변하므로 합치지 않는다. [ADR](./knowledge/decisions/2026-07-html-audio-plus-webaudio-split.md) 참조.
- **IPC 채널은 5개다.** library:list, library:add, library:remove, library:set-duration, audio:read. 채널을 추가하면 preload.ts와 api.d.ts를 함께 고친다.

## CI와 릴리스

.github/workflows/release-shadowing-player.yml이 담당한다.

- PR: ubuntu에서 tsc 컴파일만 검증한다 (electron 바이너리 다운로드 생략).
- master push: package.json 버전으로 shadowing-player-v{버전} tag와 GitHub Release를 만들고, macos-latest에서 dmg(arm64, x64)를 빌드해 release에 업로드한다.
- tag가 이미 있으면 릴리스를 건너뛴다. 새 릴리스를 내려면 package.json의 version을 올려서 merge한다.

## 주의사항

- 저장소 루트 .gitignore가 package-lock.json, dist, node_modules를 제외한다. lock 파일을 커밋하지 않는다. release/는 이 디렉터리의 .gitignore가 제외한다.
- npm install 시 allow-scripts 정책으로 electron 바이너리 다운로드(postinstall)가 막힐 수 있다. 그때는 node node_modules/electron/install.js를 직접 실행한다.
- macOS 서명 identity가 없어 dmg는 무서명으로 만든다. hprof-oom-analyzer의 [무서명 배포 결정](../hprof-oom-analyzer/knowledge/decisions/2026-07-unsigned-mac-distribution.md)과 같은 이유다.
- 파형 조작(클릭 vs 드래그 판정, 자동 스크롤, A-B 반복)의 동작 규칙은 [wiki/waveform-interaction.md](./wiki/waveform-interaction.md)에 정의되어 있다. 동작을 바꾸면 이 문서를 같이 고친다.
