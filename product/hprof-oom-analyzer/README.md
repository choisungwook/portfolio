# hprof-oom-analyzer

JVM heap dump(hprof) 파일에서 OOM 원인을 찾는 데스크톱 도구다. Eclipse MAT 같은 범용 분석기 대신, OOM 원인 추적에 실제로 쓰는 기능 4개만 담았다. TypeScript + Electron으로 만들었고 mac, linux, windows에서 동작한다.

## 기능

| 기능 | 설명 |
|---|---|
| 클래스별 히스토그램 | 클래스별 객체 수, shallow size, retained size(근사) top-N. 어떤 클래스가 메모리를 제일 먹는지 본다. |
| GC root 경로 | 객체를 GC가 못 치우게 붙잡고 있는 참조 사슬. 사실상 OOM 원인이 여기서 보인다. |
| 큰 단일 객체 탐지 | 1MB 이상 단일 객체 목록. 거대 배열, 캐시 맵을 찾는다. |
| 스레드 스택 | 덤프 시점(OOM 순간)에 각 스레드가 무엇을 실행 중이었는지 본다. |

## retained size 근사 방식

정확한 retained size는 dominator tree가 필요해서 계산이 무겁다. 이 도구는 "그 클래스의 인스턴스를 전부 제거하면 GC root에서 도달 가능한 바이트가 얼마나 줄어드는가"를 그래프 탐색으로 계산해 근사한다. OOM 원인을 좁히는 용도로는 충분한 정밀도다.

## 구조

| 디렉터리 | 역할 |
|---|---|
| src/core | hprof 파서, 분석기, 텍스트 리포트. Electron에 의존하지 않는 순수 TypeScript |
| src/main | Electron 메인 프로세스와 preload 브리지 |
| src/renderer | 렌더러 UI 로직 |
| src/tools | 합성 hprof 생성기 (테스트, CI 스모크 테스트용) |
| static | HTML, CSS |
| knowledge | 프로젝트 의사결정과 도메인 지식 (OKF 번들). agent 진입점은 [AGENTS.md](./AGENTS.md) |

## 실행

의존성 설치 후 Electron 앱을 띄운다.

```bash
cd product/hprof-oom-analyzer
npm install
npm start
```

GUI 사용법: hprof 열기 버튼으로 파일을 고르면 분석이 시작된다. 히스토그램 탭이나 1MB 이상 객체 탭에서 행을 더블클릭하면 해당 객체의 GC root 경로 탭으로 이동한다.

GUI 없이 터미널에서 텍스트 리포트만 보려면 CLI를 쓴다.

```bash
npm run build
node dist/cli.js dump.hprof
```

## 테스트

src/tools/synthetic.ts가 작은 자바 힙(스레드 → 캐시 홀더 → 2MB byte 배열)을 흉내 낸 hprof를 만들고, 이를 파싱해 4가지 기능을 vitest로 검증한다.

```bash
npm test
```

## 빌드와 아티팩트

GitHub Actions 워크플로우 build-hprof-oom-analyzer가 테스트와 CLI 스모크 테스트를 통과하면 ubuntu, macos, windows 3개 러너에서 electron-builder로 설치 파일(AppImage, dmg, nsis 인스톨러)을 빌드하고 OS별 아티팩트로 업로드한다. 로컬 빌드는 다음 명령을 쓴다.

```bash
npm run dist
```

## 한계

- 파일 전체를 메모리에 올려 파싱하므로 수 GB 덤프는 메모리와 시간이 많이 든다.
- shallow size의 객체/배열 헤더는 근사값(16/20바이트)이다. JVM 설정에 따라 실제와 다를 수 있다.
- 64비트 객체 id를 number로 다루므로 2^53을 넘는 id는 정밀도를 잃는다. 실제 힙 주소 범위에서는 문제가 없다.
- HotSpot JVM의 HPROF 1.0.2 형식만 지원한다. Android(ART) hprof는 지원하지 않는다.
- 빌드 아티팩트는 코드 서명이 없다. mac/windows에서 처음 실행할 때 보안 경고를 지나야 한다.
