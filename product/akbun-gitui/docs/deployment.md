# 배포 가이드

akbun-gitui의 빌드, 릴리스, 배포 프로세스를 설명한다.

## 버전 관리

Git tag 기반으로 버전을 관리한다. 태그 형식은 `akbun-gitui-v{MAJOR}.{MINOR}.{PATCH}`이다.

버전 업데이트 예시:

```bash
# Cargo.toml의 version 필드 수정 후
git add -A
git commit -m "bump: akbun-gitui v0.2.0"
git tag -a akbun-gitui-v0.2.0 -m "akbun-gitui v0.2.0"
git push origin master --tags
```

## GitHub Actions 워크플로우

### CI (`.github/workflows/ci.yml`)

master 브랜치 push와 PR에서 실행된다. `product/akbun-gitui/` 경로 변경 시에만 트리거된다.

실행 항목:

- `cargo fmt --check` - 코드 포맷 검사
- `cargo clippy` - 린트 검사
- `cargo test` - 테스트 실행
- 프론트엔드 빌드 및 타입 체크

### Release (`.github/workflows/release.yml`)

`akbun-gitui-v*` 태그 push 시 실행된다.

빌드 매트릭스:

| 플랫폼 | TUI 바이너리 | 데스크톱 설치파일 |
|--------|-------------|-----------------|
| Linux x86_64 | `akbun-gitui-tui-linux-amd64` | `.deb` 패키지 |
| Linux ARM64 | `akbun-gitui-tui-linux-arm64` | - |
| macOS ARM64 | `akbun-gitui-tui-macos-arm64` | `.dmg` 이미지 |
| macOS x86_64 | `akbun-gitui-tui-macos-amd64` | - |
| Windows x86_64 | `akbun-gitui-tui-windows-amd64.exe` | `.exe` 설치파일 (NSIS) |

## 릴리스 절차

### 1단계: 버전 확인

아래 파일들의 버전을 동일하게 맞춘다.

```
Cargo.toml (workspace)
crates/gitui-core/Cargo.toml
crates/gitui-tui/Cargo.toml
crates/gitui-desktop/Cargo.toml
crates/gitui-desktop/tauri.conf.json
frontend/package.json
```

### 2단계: 태그 생성 및 푸시

```bash
git tag -a akbun-gitui-v0.1.0 -m "akbun-gitui v0.1.0"
git push origin akbun-gitui-v0.1.0
```

### 3단계: GitHub Actions 확인

태그 push 후 GitHub Actions에서 release 워크플로우가 자동 실행된다.

확인 방법:

```bash
# GitHub Actions 탭에서 확인하거나
gh run list --workflow=release.yml
```

### 4단계: Release 확인

빌드 완료 후 GitHub Releases 페이지에 자동으로 릴리스가 생성된다. release notes는 자동 생성된다.

## 로컬 빌드

### TUI 바이너리

```bash
cargo build -p gitui-tui --release
# 바이너리 위치: target/release/akbun-gitui-tui
```

### 데스크톱 앱

사전 요구사항 설치 (Ubuntu):

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  pkg-config
```

빌드:

```bash
cd frontend && npm install && npm run build && cd ..
cargo install tauri-cli --version "^2"
cd crates/gitui-desktop && cargo tauri build
```

### 크로스 컴파일 (Linux ARM64)

```bash
sudo apt-get install gcc-aarch64-linux-gnu
cargo build -p gitui-tui --release --target aarch64-unknown-linux-gnu
```

## 설치 방법 (사용자)

### TUI

GitHub Releases에서 플랫폼에 맞는 바이너리를 다운로드한다.

```bash
# Linux/macOS
chmod +x akbun-gitui-tui-*
mv akbun-gitui-tui-* /usr/local/bin/akbun-gitui-tui

# 실행
akbun-gitui-tui           # 현재 디렉터리
akbun-gitui-tui /path/to/repo  # 특정 경로
```

### 데스크톱

- **macOS**: `.dmg` 파일을 열고 Applications 폴더로 드래그
- **Windows**: `.exe` 설치파일 실행
- **Ubuntu**: `.deb` 패키지 설치

```bash
sudo dpkg -i akbun-gitui-desktop-*.deb
```
