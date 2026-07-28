# How to deploy?

`shadowing.akbun.com`에 웹 버전을 배포한다. Cloudflare Pages가 master push를 받아 `dist-web/`을 빌드하고 올린다.

## 무엇을 배포하는가

Electron 앱 자체는 Cloudflare에 올릴 수 없다. main 프로세스가 Node의 fs, dialog, shell을 쓰고 dmg로 패키징되기 때문이다. 대신 renderer는 Electron API를 직접 부르지 않고 `window.api` 하나만 보고 있어서, 그 자리를 브라우저 구현으로 갈아 끼우면 같은 화면이 웹에서 그대로 돈다.

| 기능 | 데스크톱(Electron) | 웹(Cloudflare) |
|---|---|---|
| 파일·폴더 불러오기 | dialog.showOpenDialog | input[type=file], webkitdirectory |
| 목록 영속 | userData/library.json | IndexedDB |
| 오디오 읽기 | fs.readFile(절대 경로) | IndexedDB에 담아 둔 Blob |
| 설정 진입 | 상단 메뉴 (Cmd+,) | 홈 화면의 설정 버튼 |
| 저장 위치 열기 | shell.showItemInFolder | 없음 (버튼을 지운다) |
| 업데이트 확인 | dmg 내려받아 교체 | 없음 (새로고침이 곧 배포 반영) |

파형, 재생 컨트롤, 배속, A-B 구간 반복은 원래부터 브라우저 API(HTMLAudioElement, Web Audio, canvas)라 그대로 동작한다.

웹 버전의 제약이다.

- 파일을 경로로 참조하지 않고 브라우저 저장소에 복사해 둔다. 브라우저 용량(보통 사용 가능 디스크의 일부)을 넘기면 저장이 멈추고 안내를 띄운다.
- 브라우저 데이터를 지우면 목록과 파일이 함께 사라진다.
- 목록은 브라우저별로 따로 남는다. 기기 간 동기화는 없다.

## 로컬에서 확인

빌드하고 정적 서버로 띄우는 명령이다.

```bash
cd product/akbun-shadowing-player
npm install --ignore-scripts
npm run build:web
npx http-server dist-web -p 8791
```

## 1단계: Cloudflare Pages 프로젝트 생성

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
2. GitHub 리포 선택: `choisungwook/portfolio`
3. Build settings:
   - **Build command**: `cd product/akbun-shadowing-player && npm install --ignore-scripts && npm run build:web`
   - **Deploy command**: `cd product/akbun-shadowing-player && npm run deploy`
   - **Build output directory**: `product/akbun-shadowing-player/dist-web`
   - **Root directory**: `/` (monorepo이므로 루트)
4. Deploy

`--ignore-scripts`는 electron postinstall이 macOS 바이너리를 내려받는 것을 막는다. 웹 빌드는 tsc와 wrangler만 쓴다.

## 2단계: 커스텀 도메인 연결

1. Pages 프로젝트 → Custom domains → `shadowing.akbun.com`
2. Cloudflare가 자동으로 DNS CNAME 생성 + SSL 설정

## 3단계: Build Watch Paths 설정

monorepo이므로 특정 폴더 변경 시에만 빌드가 트리거되도록 설정한다.

1. Pages 프로젝트 → Settings → Builds & deployments → **Build watch paths**
2. Include paths: `product/akbun-shadowing-player/**`
3. Exclude paths: `product/akbun-shadowing-player/*.md` (md 파일 변경은 빌드 제외)

## 4단계: 배포

master 브랜치에 push하면 Cloudflare Pages가 자동 빌드/배포한다. dmg 릴리스는 기존 GitHub Actions가 그대로 담당하므로, 한 번의 push로 데스크톱 릴리스와 웹 배포가 함께 나간다.
