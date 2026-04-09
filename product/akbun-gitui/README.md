# akbun-gitui

크로스 플랫폼 Git GUI/TUI 클라이언트. macOS, Windows, Ubuntu Desktop에서 동작한다.

## 주요 기능

- Git tree 조회 (commit log, branch graph)
- Git 기본 연산: commit, stage/unstage, branch, merge, rebase
- SSH 키 / 토큰 선택기 (메뉴 바에서 credential 전환)
- 데스크톱 GUI (Tauri v2) + 터미널 TUI (ratatui) 동시 지원

## 아키텍처

Cargo workspace로 3개 크레이트를 관리한다.

```
crates/
├── gitui-core/      # Git 연산 공유 라이브러리 (git2)
├── gitui-tui/       # 터미널 UI (ratatui + crossterm)
└── gitui-desktop/   # 데스크톱 앱 (Tauri v2)

frontend/            # React + TypeScript (Tauri webview)
```

| 크레이트 | 설명 | 바이너리 이름 |
|----------|------|--------------|
| gitui-core | git2 기반 Git 연산 라이브러리 | (library) |
| gitui-tui | 터미널 UI | `akbun-gitui-tui` |
| gitui-desktop | 데스크톱 GUI | `akbun-gitui` |

## 개발 환경 설정

### 사전 요구사항

- Rust 1.80+
- Node.js 20+
- 시스템 의존성 (Linux):

```bash
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev pkg-config
```

### 빌드

TUI만 빌드:

```bash
cargo build -p gitui-tui --release
```

데스크톱 앱 빌드 (프론트엔드 먼저):

```bash
cd frontend && npm install && npm run build && cd ..
cargo build -p gitui-desktop --release
```

### 개발 모드

TUI 개발:

```bash
cargo run -p gitui-tui
```

데스크톱 개발 (핫 리로드):

```bash
cd frontend && npm run dev &
cargo run -p gitui-desktop
```

## 키보드 단축키 (TUI)

| 키 | 동작 |
|----|------|
| `1`-`4` | 탭 전환 (Status/Log/Branches/Diff) |
| `j`/`k` 또는 `↑`/`↓` | 항목 이동 |
| `Enter` | 선택/확인 |
| `s` | 파일 stage |
| `u` | 파일 unstage |
| `c` | 커밋 |
| `p` | credential 선택 |
| `?` | 도움말 |
| `q` | 종료 |

## 릴리스

GitHub Actions로 tag push 시 자동 빌드된다. 자세한 내용은 [배포 문서](./docs/deployment.md)를 참고한다.

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

GitHub Releases에서 플랫폼별 바이너리/설치파일을 다운로드할 수 있다.
