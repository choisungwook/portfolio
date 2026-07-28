# akbun-shadowing-player

언어 공부(쉐도잉)용 구간 반복 오디오 플레이어다. TypeScript + Electron으로 만들었고 macOS만 빌드한다. 음성 파일(mp3, wav 등)을 불러와 파형을 보면서 구간 반복(A-B), 배속, ±5초 이동으로 반복 청취한다.

같은 화면을 설치 없이 쓸 수 있게 웹 버전도 함께 배포한다: <https://shadowing.akbun.com>

## 기능

- 음성 파일 불러오기(mp3, wav, m4a, aac, ogg, flac)와 목록 관리
- 파형 화면: 왼쪽 버튼 드래그로 좌우 스크롤, 클릭하면 그 지점부터 재생
- 재생/일시정지, 배속(0.5x~2.0x, 음정 유지), +5초/−5초 이동
- 구간 반복: A/B 지점을 잡으면 그 구간을 무한 반복

## 실행

빌드하고 실행하는 명령이다.

```bash
cd product/akbun-shadowing-player
npm install
npm run build   # tsc 2회: main + renderer
npm start       # Electron 실행
npm run dist    # macOS dmg 패키징 (release/)
```

## 웹 버전

renderer는 그대로 두고 `window.api`만 브라우저 구현(IndexedDB + input[type=file])으로 갈아 끼워 정적 사이트로 만든다. 빌드하고 로컬에서 확인하는 명령이다.

```bash
npm run build:web            # dist-web/ 생성
npx http-server dist-web -p 8791
```

배포 설정과 데스크톱 대비 제약은 [deploy.md](./deploy.md)에 있다.

## 로그

앱과 렌더러의 오류 로그는 macOS 사용자 로그 관례 위치에 사용자 권한으로 쓴다. 파일이 1MB를 넘으면 main.log.1~main.log.5로 rotation한다.

로그 파일을 확인하는 명령이다.

```bash
tail -f ~/Library/Logs/akbun-shadowing-player/main.log
```

## 문서

- [AGENTS.md](./AGENTS.md) - 이 디렉터리에서 작업하는 agent의 진입점
- [deploy.md](./deploy.md) - 웹 버전 Cloudflare 배포 설정과 제약
- [wiki/architecture.md](./wiki/architecture.md) - 프로세스 구조, IPC, 데이터 흐름
- [wiki/waveform-interaction.md](./wiki/waveform-interaction.md) - 파형 조작 규칙과 구간 반복 동작
- [knowledge/](./knowledge/index.md) - 의사결정(ADR) 기록
