# hprof-oom-analyzer Agent Guide

JVM heap dump(hprof)에서 OOM 원인을 찾는 TypeScript + Electron 데스크톱 도구다. 이 파일은 이 디렉터리에서 작업하는 agent의 진입점이다. 저장소 전체 규칙은 [루트 AGENTS.md](../../AGENTS.md)를 따르고, 이 프로젝트에서 얻은 의사결정과 도메인 지식은 [knowledge/](./knowledge/index.md)에 기록되어 있다.

## 기능 범위

OOM 분석에 실제로 쓰는 4개 기능만 유지한다. 범용 힙 분석기(MAT 대체)로 확장하지 않는다.

1. 클래스별 히스토그램 (shallow + retained 근사)
2. GC root 경로 (참조 사슬 역추적)
3. 1MB 이상 단일 객체 탐지
4. 스레드 스택

## 디렉터리

| 경로 | 역할 |
|---|---|
| src/core | hprof 파서, 분석기, 텍스트 리포트. **Electron에 의존하지 않는다** |
| src/main | Electron 메인 프로세스(main.ts)와 preload 브리지(preload.ts) |
| src/renderer | 렌더러 UI. import/export 없는 스크립트로만 작성한다 (아래 제약 참조) |
| src/tools | 합성 hprof 생성기. 테스트와 CI 스모크 테스트가 쓴다 |
| src/cli.ts | GUI 없는 텍스트 리포트 CLI |
| static | index.html, style.css |
| tests | vitest 테스트 |
| knowledge | 이 프로젝트의 OKF 지식 번들 |

## 명령어

빌드, 테스트, 실행, 패키징 순서다.

```bash
cd product/hprof-oom-analyzer
npm install
npm run build        # tsc 2회: main/core/cli + renderer
npm test             # vitest
npm start            # Electron GUI
node dist/cli.js dump.hprof          # 텍스트 리포트
node dist/tools/make-sample.js x.hprof  # 합성 덤프 생성
npm run dist         # electron-builder 패키징
```

## 아키텍처 제약

- **core는 순수하게 유지한다.** 분석 로직은 src/core에만 두고 Electron API를 import하지 않는다. CLI와 테스트가 GUI 없이 core를 그대로 쓴다.
- **renderer는 모듈이 아니다.** tsconfig.renderer.json이 module: none으로 컴파일해 script 태그로 로드한다. import/export를 쓰면 컴파일 에러가 난다. main↔renderer 데이터 타입은 src/renderer/api.d.ts의 전역 선언으로 공유하고, main.ts의 IPC 핸들러 반환 형태와 수동으로 맞춘다. 이유는 [knowledge/decisions/2026-07-renderer-script-without-modules.md](./knowledge/decisions/2026-07-renderer-script-without-modules.md) 참조.
- **IPC 채널은 4개다.** open-file, analyze, path-to-root, largest-path. 기능을 추가할 때는 [knowledge/playbooks/add-analysis-feature.md](./knowledge/playbooks/add-analysis-feature.md) 절차를 따른다.
- **객체 id는 number다.** 64비트 id를 상위/하위 32비트 조합으로 읽으므로 2^53 초과 시 정밀도를 잃는다. 실제 힙 주소 범위에서는 문제가 없어 BigInt로 바꾸지 않았다.

## 테스트 전략

실제 hprof 파일 대신 src/tools/synthetic.ts가 만드는 합성 덤프로 검증한다. 힙 구조는 "main 스레드 → CacheHolder(static INSTANCE 포함) → Object[] → 2MB/512KB byte[]"이고, 4개 기능이 모두 이 구조에서 검증 가능하도록 설계했다. 파서에 레코드 지원을 추가하면 synthetic.ts에도 해당 레코드를 추가해 회귀 테스트를 만든다.

## CI와 아티팩트

.github/workflows/build-hprof-oom-analyzer.yml이 test job(컴파일, vitest, CLI 스모크 테스트) 통과 후 ubuntu/macos/windows에서 electron-builder로 AppImage, dmg, nsis 인스톨러를 빌드해 아티팩트로 업로드한다. master push, PR, workflow_dispatch에서 돈다.

## 주의사항

- 저장소 루트 .gitignore가 package-lock.json과 uv.lock을 제외한다. lock 파일을 커밋하지 말고, CI는 npm ci가 아닌 npm install을 유지한다.
- Claude Code 원격 컨테이너의 프록시는 GitHub release 바이너리 다운로드를 403으로 막는다. 로컬에서 npm install 시 ELECTRON_SKIP_BINARY_DOWNLOAD=1을 쓰고, electron-builder 패키징 검증은 CI에 맡긴다. 컴파일·vitest·CLI 스모크 테스트까지는 로컬에서 가능하다.
- HPROF 1.0.2(HotSpot)만 지원한다. Android(ART) hprof의 확장 서브태그를 만나면 파서가 HprofParseError를 던진다. 지원 범위는 [knowledge/topics/hprof-format.md](./knowledge/topics/hprof-format.md) 참조.
