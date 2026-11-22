# akbun-taskq 변경 이력

버전마다 폴더 하나를 둔다. `changelog.md`는 사용자에게 보이는 변화를 적은 릴리스 노트이고, GitHub release 본문이 이 파일에서 나온다. 같은 폴더의 `learning_changelog.md`는 그 버전에서 코드를 어떻게 고쳤고 구조가 어떻게 바뀌었는지를 나중에 다시 읽으려고 남기는 해설이다. 0.28.0부터 쓰기 시작해 그 전 버전에는 없다.

작성 절차는 [wiki/development.md](../wiki/development.md#maintain-the-changelog)에 있다.

## 버전 목록

새 버전은 표 맨 위에 추가한다.

| 버전 | 해설 | 첫 항목 |
|---|---|---|
| [0.41.0](0.41.0/changelog.md) | [learning](0.41.0/learning_changelog.md) | `bots.aimemory` 옵션으로 bot이 `aimem search`/`aimem add`를 호출해 장기 메모리를 조회·기록한다. |
| [0.40.1](0.40.1/changelog.md) | [learning](0.40.1/learning_changelog.md) | ↑로 불러온 메시지를 고친 뒤 다시 ↑를 눌러도 고친 내용이 사라지지 않는다. |
| [0.40.0](0.40.0/changelog.md) | [learning](0.40.0/learning_changelog.md) | 초안에 담당 bot을 정해도 bot이 일하지 않고, 대화에 할당 알림만 남는다. |
| [0.39.1](0.39.1/changelog.md) | [learning](0.39.1/learning_changelog.md) | 사용자에게 보이는 동작은 바뀌지 않았다. |
| [0.39.0](0.39.0/changelog.md) | [learning](0.39.0/learning_changelog.md) | 데스크톱 앱의 시작 화면 글씨를 키우고 진행 막대와 퍼센트를 보인다. |
| [0.38.0](0.38.0/changelog.md) | [learning](0.38.0/learning_changelog.md) | 설정 > Database에서 데이터베이스를 백업하고 내려받는다. |
| [0.37.0](0.37.0/changelog.md) | [learning](0.37.0/learning_changelog.md) | 작업에 저장소를 여러 개 지정한다. |
| [0.36.0](0.36.0/changelog.md) | [learning](0.36.0/learning_changelog.md) | 모든 bot이 taskq 기본 skill을 갖는다. |
| [0.35.0](0.35.0/changelog.md) | [learning](0.35.0/learning_changelog.md) | 설정 > 연결 맨 위에서 TLS 검사용 루트 인증서를 가져온다. |
| [0.34.0](0.34.0/changelog.md) | [learning](0.34.0/learning_changelog.md) | bot 대화 오른쪽 맨 위에 컨텍스트가 보인다. |
| [0.33.0](0.33.0/changelog.md) | [learning](0.33.0/learning_changelog.md) | task 상태보드의 세 칸을 테두리와 제목이 있는 패널로 나눴다. |
| [0.32.0](0.32.0/changelog.md) | [learning](0.32.0/learning_changelog.md) | 모든 Claude bot과 작업 실행에서 auto compaction이 항상 켜진다. |
| [0.31.0](0.31.0/changelog.md) | [learning](0.31.0/learning_changelog.md) | task 상태보드에서 카드를 끌어 다른 열에 놓아 상태를 바꾼다. |
| [0.30.2](0.30.2/changelog.md) | [learning](0.30.2/learning_changelog.md) | 작업 상세 창을 설정 창처럼 창 가장자리만 남기고 화면을 채우도록 키웠다. |
| [0.30.1](0.30.1/changelog.md) | [learning](0.30.1/learning_changelog.md) | 셸을 쓰는 bot이 Chrome의 DevTools 포트로 자기 브라우저를 직접 조종해 클릭·입력 승인을 건너뛸 수 있던 문제. |
| [0.30.0](0.30.0/changelog.md) | [learning](0.30.0/learning_changelog.md) | bot 브라우저의 클릭과 입력에 승인 게이트를 넣었다. |
| [0.29.0](0.29.0/changelog.md) | [learning](0.29.0/learning_changelog.md) | bot이 자기 브라우저를 조종하고, CSV·Excel·PowerPoint 파일을 다룬다. |
| [0.28.1](0.28.1/changelog.md) | [learning](0.28.1/learning_changelog.md) | 설정 > 연결을 열 때마다 절마다의 연결 상태가 비고 OpenAI 방식 선택이 처음 값으로 돌아가던 문제. |
| [0.28.0](0.28.0/changelog.md) | [learning](0.28.0/learning_changelog.md) | bot 대화에 작업 과정을 보인다. |
| [0.27.0](0.27.0/changelog.md) |  | 설정 > 연결을 Claude, OpenAI, Kiro 절로 나눴다. |
| [0.26.0](0.26.0/changelog.md) |  | 설정의 사용량 제한 메뉴와 기능을 없앴다. |
| [0.25.0](0.25.0/changelog.md) |  | Plugins의 공식 marketplace 목록에서 plugin을 바로 설치한다. |
| [0.24.0](0.24.0/changelog.md) |  | 설정 > 폴더의 세션 대화 기록을 런타임별로 나눠 보인다. |
| [0.23.0](0.23.0/changelog.md) |  | 설정 > 연결에서 Claude의 로그인 방식을 Anthropic API key로 고르면 API key 입력란이 나온다. |
| [0.22.3](0.22.3/changelog.md) |  | 공용 폴더와 캘린더의 보기 전환 버튼 묶음에서 선택하거나 마우스를 올린 버튼의 배경이 바깥 테두리를 덮어 테두리가 끊겨 보이던 문제. 테두리를 inset 그림… |
| [0.22.2](0.22.2/changelog.md) |  | GitHub Release에 Linux 바이너리(`taskq-linux-x64.tar.gz`)를 더 올리지 않는다. |
| [0.22.1](0.22.1/changelog.md) |  | Finder에서 연 데스크톱 앱이 `EROFS: read-only file system, mkdir '/data'`로 시작하지 못하던 문제. Finder로 연… |
| [0.22.0](0.22.0/changelog.md) |  | Kiro의 AWS SSO 로그인이 시작되지 않던 문제. kiro-cli는 start URL과 region을 인자로 받아도 터미널에서 다시 묻고, 터미널이 없으… |
| [0.21.0](0.21.0/changelog.md) |  | macOS 데스크톱 앱. GitHub Release에 `taskq-desktop-darwin-arm64.dmg`(Apple silicon)가 함께 올라온다. |
| [0.20.0](0.20.0/changelog.md) |  | bot의 예산 기능을 없앴다. |
| [0.19.0](0.19.0/changelog.md) |  | 긴 대화를 새 세션으로 넘긴다. |
| [0.18.0](0.18.0/changelog.md) |  | 하루 예산의 80%를 쓰면 사이드바 Bots 머리글의 Running 자리에 "Budget 85%"처럼 쓴 비율이 보인다. |
| [0.17.0](0.17.0/changelog.md) |  | 설정 > 업데이트: 설치된 버전과 GitHub의 최신 akbun-taskq release를 보여 준다. |
| [0.16.1](0.16.1/changelog.md) |  | bot 대화를 가운데 한 열(최대 820px)로 정돈했다. |
| [0.16.0](0.16.0/changelog.md) |  | bot 대화 입력창에서 `@`를 치면 다른 bot과 공용 폴더 파일을 자동완성한다. |
| [0.15.0](0.15.0/changelog.md) |  | bot 대화 머리글에 파일(이 대화의 파일 목록)과 브라우저 아이콘을 두었다. |
| [0.14.1](0.14.1/changelog.md) |  | 헤더의 알림 종과 설정을 오른쪽 끝으로 옮겼다. |
| [0.14.0](0.14.0/changelog.md) |  | bot이 만든 파일(HTML, Markdown, 슬라이드, 문서 등)은 공용 폴더의 `outputs/<bot>/`에 저장하고 `send_message`의 `f… |
| [0.13.1](0.13.1/changelog.md) |  | 확인 필요(Must check)를 오른쪽 열에서 헤더의 종 아이콘으로 옮겼다. |
| [0.13.0](0.13.0/changelog.md) |  | 설정 > 연결의 "bot 로그인 방식": Claude의 provider(Bedrock, Anthropic API 키, Claude 구독), AWS 프로파일,… |
| [0.12.0](0.12.0/changelog.md) |  | 먼저 묻기: 되돌릴 수 없는 명령(push, publish, release, `terraform apply`·`destroy`, `kubectl apply`·… |
| [0.11.0](0.11.0/changelog.md) |  | 설정의 연결(Connections) 페이지: bot이 모델에 닿는 방법마다 카드 하나(Claude provider, OpenAI API 키, OpenAI Be… |
| [0.10.2](0.10.2/changelog.md) |  | bot 생성 창에서 저장 버튼(Save, 이제 생성 때는 Create)을 눌러도 bot이 생기지 않고 오류도 없던 문제. 폼에 `name="sdk"` 필드가… |
| [0.10.1](0.10.1/changelog.md) |  | `@anthropic-ai/claude-agent-sdk` 0.3.325 → 0.3.327(Claude Code v2.1.327과 같은 수준). peer인 `… |
| [0.10.0](0.10.0/changelog.md) |  | task worktree. 새 작업에서 저장소나 폴더를 고른다(알려진 저장소 목록과 직접 입력). 저장소에서 코드를 고치는 작업은 기본으로 자기 worktre… |
| [0.9.0](0.9.0/changelog.md) |  | 상주 bot. bot마다 역할, 설명, 지시, 자기 Claude 세션을 갖고, 메시지가 올 때마다 그 세션을 이어서(`resume`) 한 turn 일한다. |
| [0.8.0](0.8.0/changelog.md) |  | Windows 데스크톱에서 인계와 중요 경고 알림을 표시한다. |
| [0.7.0](0.7.0/changelog.md) |  | 후속 태스크가 완료된 선행 태스크의 실행 ID, 요약과 지정된 산출물 경로를 전달받는다. |
| [0.6.0](0.6.0/changelog.md) |  | 보드의 상태별 카드에서 즉시 실행할 수 있다. |
| [0.5.0](0.5.0/changelog.md) |  | 대시보드와 주요 컨트롤에 IBM Carbon Design System을 적용했다. |
| [0.4.0](0.4.0/changelog.md) |  | Agent SDK를 교체할 수 있도록 공통 인터페이스와 Claude 구현을 분리했다. |
| [0.2.0](0.2.0/changelog.md) |  | Apple silicon과 Linux x86_64 바이너리에 Claude Code, UI 및 DB 스키마를 내장했다. |
| [0.1.0](0.1.0/changelog.md) |  | 개인용 태스크 큐에 실행 기록, 도구 승인, 종속 관계와 검토 화면을 제공한다. |
