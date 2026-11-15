# akbun-terminal을 core daemon, tui, desktop으로 분리

- Issue: 미생성 (PR 만들 때 함께 생성)
- Branch: claude/charming-pascal-e9ndf5

## 실행 계획

- [x] 1. 디렉터리 재배치: `workspace/core` 단일 crate, `workspace/desktop`으로 Swift package 이동, ffi crate와 C 헤더 삭제
- [x] 2. core: socket daemon, event hub, client 라이브러리, protocol v3, CLI
- [x] 3. desktop: CoreBridge를 socket client로 교체, Package.swift와 scripts 갱신
- [x] 4. tui: ratatui client 신규 작성
- [x] 5. release workflow, VERSION 0.16.0, README, wiki, knowledge 갱신
- [ ] 6. 검증: cargo test, tmux로 tui 실행 확인, diff 리뷰

## 다음 세션이 알아야 할 것

- 이 환경은 Linux라 Swift를 빌드할 수 없다. desktop 변경은 PR의 macOS job(`swift test`)으로만 검증된다
- wire: Unix socket, 한 줄에 JSON 하나. 요청은 기존 `{"v":3,"command":..}`, 응답은 `{"reply":..}`, 이벤트는 `{"event":..}`
- macOS 데이터 디렉터리는 desktop이 쓰던 `~/Library/Application Support/io.akbun.terminal`을 core도 그대로 쓴다
- desktop은 컴파일하지 않은 상태다. 실패 가능 지점: `CoreConnection.swift`의 posix_spawn 인자 타입, sun_path 복사, `Protocol.swift`의 hello 기본값
- desktop은 이번 범위에서 종료할 때 자기 session을 닫는 기존 동작을 유지한다. 재실행 때 session 복원은 다음 작업
