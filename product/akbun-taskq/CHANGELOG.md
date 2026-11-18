# akbun-taskq Changelog

<!-- markdownlint-configure-file {"MD024": {"siblings_only": true}} -->

## 0.9.0

### Added

- 역할별 상주 agent 팀을 추가했다. lead, planner, coder, reviewer, doc-reviewer가 각자 역할과 세션을 갖고, 메시지를 받을 때마다 같은 세션을 이어서 일한다. `team.enabled`로 켜며 기본은 꺼져 있다.
- agent끼리 비동기 메시지로 일을 넘기고, 큐 작업을 만들어 실제 코드 수정과 조사를 맡긴다. 작업이 끝나면 결과가 그 작업을 맡은 agent에게 메시지로 돌아온다.
- 팀이 함께 쓰는 wiki를 SQLite에 두었다. 쓸 때마다 이전 revision이 남고, 두 agent가 같은 페이지를 동시에 고치면 뒤의 쓰기가 거절된다.
- `taskq team` 명령과 Team 탭에서 lead에게 일을 맡기고, 메시지 기록과 wiki를 보고, 팀을 멈추거나 다시 켠다.
- 일일 예산, agent별 시간당 턴 수, 열린 작업 수, 메시지 재시도 횟수에 상한을 두었다. 상한에 걸리면 팀 전체가 멈추고 경고 하나가 뜬다.
- `team.personaSkill`에 사용자 대리 판단용 skill 폴더를 지정하면 lead와 리뷰 agent가 그 기준으로 판단하고 리뷰한다.

## 0.8.0

### Added

- Windows 데스크톱에서 인계와 중요 경고 알림을 표시한다. WSL2에서 실행 중인 taskq도 Windows에 알림을 보낼 수 있다.
- Settings의 Desktop notifications에서 운영체제 알림을 켜고 끌 수 있다. 설정과 앱 내 알림 기록은 재시작 후에도 유지된다.

## 0.7.0

### Added

- 후속 태스크가 완료된 선행 태스크의 실행 ID, 요약과 지정된 산출물 경로를 전달받는다. `Depends on`으로 조사, 설계, 구현을 연결할 수 있다.
- 인계가 도착하면 SQLite에 이력과 알림을 남기고 macOS 알림을 요청한다. 자동 수락을 끈 태스크는 수동 수락을 기다린다.
- 화면과 CLI에서 인계 내역을 보고 수락 모드를 바꿀 수 있다. AI 에이전트는 `taskq mcp`의 읽기 도구로 같은 이력과 수락 설정을 조회할 수 있다.
- Codex의 push 및 PR 생성 전 검사와 GitHub Actions에서 현재 버전의 CHANGELOG 항목을 확인한다.

### Changed

- 태스크를 가져오는 DB 갱신에서도 선행 태스크 상태를 확인해, 선택 직후 선행 작업이 재실행되면 후속 작업을 대기시킨다.
- GitHub 릴리즈 노트의 변경 사항을 해당 버전의 CHANGELOG에서 가져온다.

### Removed

- taskq 릴리즈 노트에서 PR 제목을 모아 변경 사항을 생성하던 방식을 제거했다.

## 0.6.0

### Added

- 보드의 상태별 카드에서 즉시 실행할 수 있다. 검토 완료 또는 종료된 태스크도 다시 실행할 수 있다.

### Changed

- 기본 폴링 간격을 2초에서 60초로 늘렸다. 같은 프로세스의 API 작업과 실행 종료는 큐를 즉시 깨운다.

## 0.5.0

### Changed

- 대시보드와 주요 컨트롤에 IBM Carbon Design System을 적용했다.

## 0.4.0

### Added

- Agent SDK를 교체할 수 있도록 공통 인터페이스와 Claude 구현을 분리했다.

### Changed

- taskq 자체 설정과 데이터에 대한 변조 시도가 감지되면 세션을 중단하고 검토 알림을 남긴다.

## 0.2.0

### Added

- Apple silicon과 Linux x86_64 바이너리에 Claude Code, UI 및 DB 스키마를 내장했다.
- 사용자 지정 CA 번들을 설정할 수 있다.

## 0.1.0

### Added

- 개인용 태스크 큐에 실행 기록, 도구 승인, 종속 관계와 검토 화면을 제공한다.
