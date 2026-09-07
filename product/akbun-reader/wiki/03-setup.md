# CLI 환경 설정

- Rust stable과 OS keychain이 있는 환경 필요; macOS 우선 검증
- Worker와 D1 준비는 [개발 환경](development.md) 참고
- 0003_import.sql까지 migration 적용 필요
- /api/*와 /cli-login.html은 본인만 허용하는 Access 정책 유지
- /automation/*와 /mcp만 별도 Access 애플리케이션 Bypass 경로로 지정
- Bypass 경로에서도 Worker의 Bearer 검증 필수; 토큰 없음·폐기 토큰 요청 401 확인
- /automation/tokens는 토큰 인증으로 접근 불가
- 실제 Access 설정·배포는 로컬 구현 검증에 포함하지 않음

## 로컬 명령과 검증

workspace/cli에서 소스 실행과 검증.

```bash
cargo run -- --help
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo fmt --check
```

개발 서버 실행 뒤 로그인. HTTP 예외는 loopback에만 적용.

```bash
cargo run -- --server http://127.0.0.1:8787 auth login
```

- 로컬 서버에서도 실제 인증 구성이 필요; 개발용 인증 우회 기능 없음
- 운영 주소는 --server 생략 시 reader.akbun.com
- 브라우저에서 이 컴퓨터의 CLI를 직접 실행했는지 확인 후 발급 버튼 클릭
- 성공 시 OS keychain 저장; 토큰 원문을 평문 파일로 옮기지 않음
- HTTPS 페이지에서 loopback 접근이 브라우저 정책에 막히면 실패 표시; 실제 사용할 브라우저에서 확인 필요

## launchd 주기 실행 예시

로그인한 macOS 사용자 세션에서 이미 준비한 CLI 실행 파일의 절대 경로 지정. launchd 설치·실행은 수동 선택.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.akbun.reader.export</string>
  <key>ProgramArguments</key>
  <array>
    <string>/absolute/path/to/reader</string>
    <string>export</string>
    <string>--vault</string><string>/absolute/path/to/vault</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
```

- ~/Library/LaunchAgents/com.akbun.reader.export.plist에 실제 경로로 저장
- 최초 로그인과 keychain 접근 허용은 대화형 터미널에서 완료
- keychain이 잠겨 있으면 동기화 실패; 로그인 세션 복귀 후 재시도
- Mac 잠자기·종료 중 즉시 동기화 보장 없음
- 바이너리 Release·서명·설치 패키지·자동 배포는 별도 범위
