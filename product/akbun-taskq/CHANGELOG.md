# akbun-taskq Changelog

<!-- markdownlint-configure-file {"MD024": {"siblings_only": true}} -->

## 0.22.3

### Changed

- 공용 폴더와 캘린더의 보기 전환 버튼 묶음에서 선택하거나 마우스를 올린 버튼의 배경이 바깥 테두리를 덮어 테두리가 끊겨 보이던 문제. 테두리를 inset 그림자 대신 실제 border로 그리고 모서리를 잘라, 버튼 배경이 테두리 안쪽에만 칠해진다.

### SDK

변경 없음.

## 0.22.2

### Changed

- GitHub Release에 Linux 바이너리(`taskq-linux-x64.tar.gz`)를 더 올리지 않는다. Apple silicon용 명령줄 실행 파일(`taskq-darwin-arm64.tar.gz`)과 데스크톱 앱(`taskq-desktop-darwin-arm64.dmg`)만 올린다.
- Linux에서 실행한 taskq의 설정 > 업데이트는 이 기기용 build가 없다고 알리고 설치하지 않는다.

### SDK

변경 없음.

## 0.22.1

### Fixed

- Finder에서 연 데스크톱 앱이 `EROFS: read-only file system, mkdir '/data'`로 시작하지 못하던 문제. Finder로 연 앱의 현재 디렉터리는 `/`이고, `TASKQ_HOME`이 없으면 taskq는 현재 디렉터리를 home으로 쓴다. 이제 앱은 셸 프로필에 `TASKQ_HOME`이 없으면 `~/.taskq`를 만들어 home으로 쓴다. 명령줄 실행은 그대로 현재 디렉터리를 쓴다.

### Changed

- 데스크톱 앱의 데이터 폴더가 `~/.taskq`가 됐다(셸 프로필에 `TASKQ_HOME`이 없을 때). 앱과 같은 데이터를 명령줄로 다루려면 `TASKQ_HOME=~/.taskq`를 지정한다. 상대 경로로 적은 `TASKQ_HOME`은 앱이 절대 경로로 바꿔 넘긴다.

### SDK

변경 없음.

## 0.22.0

### Fixed

- Kiro의 AWS SSO 로그인이 시작되지 않던 문제. kiro-cli는 start URL과 region을 인자로 받아도 터미널에서 다시 묻고, 터미널이 없으면 끝난다. 이제 로그인을 터미널 아래에서 실행하고 두 질문에 Enter로 답한다. IAM Identity Center로 로그인하도록 `--license pro`도 넘긴다. 끝내지 않은 로그인은 15분 뒤 정리한다.
- Kiro 로그인 확인(`kiro-cli whoami`)의 대기를 10초에서 30초로 늘렸다. 저장된 토큰이 만료돼 있으면 whoami가 먼저 토큰을 새로 받는데 IAM Identity Center에서는 10초를 넘긴다. 시간 안에 답이 없으면 그 이유(30초 안에 답이 없었음)를 보여 주고, 이것만으로 bot을 끄지는 않는다.
- Kiro bot의 로그인이 풀렸는데 그 bot이 꺼지지 않고 같은 요청을 다시 보내던 경우. 만료된 토큰, 바뀐 계정의 토큰, 출력 기록 안의 오류도 로그인 실패로 읽는다. `AccessDenied`, `Unauthorized`, 401·403, `dispatch failure`처럼 뜻이 여럿인 오류는 `kiro-cli whoami`로 확인해 로그인이 풀린 때만 bot을 끈다.
- OpenAI on Bedrock bot이 AWS SSO 세션이 끝난 뒤에도 같은 요청을 다시 보내다 메시지를 따로 두던 문제. AWS 프로파일이 자격 증명을 주지 않으면 로그인 실패로 보고 그 bot을 끄며, `aws sso login --profile <이름>`을 안내한다. 다시 로그인하면 화면이 열려 있는 동안 1분 안에 bot이 저절로 켜지고, 설정 > 연결의 다시 확인으로 바로 켤 수도 있다. Bedrock이 401이나 403으로 답하면 10분 동안 보관하던 토큰을 버리고 프로파일에 다시 묻는다.

### Changed

- Kiro bot의 모델 메뉴가 `kiro-cli`가 알려 주는 모델 목록을 보여 준다(context 크기와 credit 배율 포함). 전에는 목록이 비어 있었다.
- Kiro의 사용 한도(월·일·주 한도)에 걸린 요청과 형식이 거부된 요청은 다시 보내지 않고 바로 따로 둔다. 다시 보내도 같은 답이 오기 때문이다.

### SDK

변경 없음. Kiro는 SDK가 아니라 `kiro-cli` 실행이며, 모델 목록에 `kiro-cli chat --list-models --format json --no-interactive`를 새로 쓴다.

## 0.21.0

### Added

- macOS 데스크톱 앱. GitHub Release에 `taskq-desktop-darwin-arm64.dmg`(Apple silicon)가 함께 올라온다. 앱을 열면 안에 든 taskq 실행 파일이 시작되고 그 화면이 앱 창에 뜬다. 터미널에서 `taskq run`을 하고 주소를 브라우저에 붙여 넣는 과정이 없다. 창을 닫으면 taskq도 함께 끝난다. taskq는 로그인 셸을 거쳐 시작하므로 bot이 터미널과 같은 PATH로 `aws`, `git`, `codex`, `kiro-cli`를 찾는다. 설정 파일과 데이터 폴더는 명령줄 실행 파일과 같다. 앱 안의 taskq는 설정 > 업데이트로 올리고, 올린 뒤 앱을 다시 연다.
- 데스크톱 앱 창에서 새 창으로 여는 링크(PR, release notes, Kiro 로그인 주소)는 기본 브라우저로 열리고, 내려받는 파일은 `~/Downloads`에 저장된다.

### Changed

- 삭제 확인과 workflow 승인 메모를 브라우저의 `confirm`, `prompt` 대신 화면 안의 dialog로 묻는다. 브라우저가 아닌 창에서는 그 둘이 아무것도 보이지 않고 취소로 끝나기 때문이다. workflow 승인·거절에서 메모 창을 취소하면 이제 아무것도 보내지 않는다(전에는 빈 메모로 보냈다).

### SDK

변경 없음.

## 0.20.0

### Changed

- bot의 예산 기능을 없앴다. 하루 예산(`daily_budget_usd`, `bots.dailyBudgetUsd`), turn당 예산(`turn_budget_usd`, `bots.turnBudgetUsd`, bot별 값 포함), 사이드바의 "Budget N%" 표시, `GET /api/bots`의 `budget`이 사라졌다. bot은 예산 때문에 멈추지 않고, 비용 값 없이 끝난 turn은 0으로 기록한다. bot을 묶는 한도는 시간당 turn, turn당 모델 턴, 재시도 횟수, 대화 크기다. 설정 파일에 남은 예산 키는 무시한다. 큐가 실행하는 작업의 `maxBudgetUsd`는 그대로다.
- bot 설정 창에서 Model 입력을 뺐다. 모델은 대화 입력창 아래의 메뉴에서 고른다.

### Fixed

- 설정 > 연결에서 다시 확인해 "연결됨"이 되어도 bot은 그대로 꺼져 있던 문제. 로그인이 실패하면 taskq가 그 bot을 끄는데(Claude는 bot 전체를 멈춤), 다시 로그인해도 켜 주는 곳이 없었다. 이제 다시 확인한 검사가 통과하면 로그인 실패로 꺼진 bot을 다시 켜고, Claude 로그인 실패로 멈춘 bot 전체를 다시 돌린다. 사용자가 직접 끈 bot은 그대로 둔다. 다시 확인 직후 사이드바의 연결 표시와 열려 있는 대화의 안내도 바로 갱신한다.
- bot 대화의 모델·effort·권한 메뉴를 열어 두면 5초쯤 뒤에 닫히던 문제. 5초마다 도는 갱신이 메뉴 줄을 통째로 다시 그렸다. 이제 보이는 값이 바뀔 때만 다시 그린다.

### SDK

Claude Agent SDK의 bot turn 호출에서 `maxBudgetUsd` 옵션을 뺐다. 그 밖의 SDK 사용 변경 없음.

## 0.19.0

### Added

- 긴 대화를 새 세션으로 넘긴다. bot의 대화가 설정 > 사용량 제한의 "새 세션으로 넘기는 대화 크기"(`session_max_tokens`, 기본 100,000 토큰)나 모델 context의 80%를 넘으면, taskq가 그 bot에게 인수인계 메모를 쓰라고 한 번 요청한다. bot은 그 turn에 함께 온 메시지를 평소대로 처리한 뒤 `write_handover`로 메모(7,500자까지)를 남기고, turn이 끝나면 세션이 비워지며 메모가 새 세션의 첫 메시지로 온다. 세션의 첫 turn에는 요청하지 않고, 사용자가 대화를 초기화했거나 요청한 turn이 취소됐으면 요청을 거둔다. 이어지는 대화는 매 turn 전체가 다시 전송(또는 과금)되므로 몇 주 쓴 bot의 turn당 입력 토큰이 계속 커지던 것을 막는다. Claude, OpenAI(API key, Bedrock), Kiro bot에 적용된다.
- Codex CLI bot은 Codex가 자기 thread를 요약하므로, 같은 한도를 `model_auto_compact_token_limit`으로 넘긴다.
- bot 도구 `write_handover`: taskq가 인수인계를 요청했을 때만 쓸 수 있다.

### SDK

Codex CLI 호출에 `--config model_auto_compact_token_limit=<session_max_tokens>`가 추가됐다. 그 밖의 SDK 사용 변경 없음.

## 0.18.0

### Added

- 하루 예산의 80%를 쓰면 사이드바 Bots 머리글의 Running 자리에 "Budget 85%"처럼 쓴 비율이 보인다. 마우스를 올리면 쓴 금액과 한도가 나온다. `GET /api/bots`가 `budget: { spent_usd, limit_usd }`를 돌려준다.

### Changed

- 모델 제공자가 요청 자체를 거부한 turn(HTTP 4xx, 403·408·429 제외: 지원하지 않는 모델 ID나 설정)은 다시 시도하지 않는다. 같은 요청은 같은 답을 받기 때문이다. 메시지는 바로 따로 두고 알림에 이유와 원문 오류를 남긴다. 이전에는 `maxAttempts`번까지 다시 시도했다.

### Fixed

- 거부된 turn이 예산을 깎던 문제. 비용 값 없이 실패한 turn은 turn 예산 전액(기본 $1)을 쓴 것으로 계산하는데, 거부된 요청은 생성된 것이 없는데도 이 계산에 걸려 재시도 몇 번에 하루 예산이 소진된 것으로 처리되고 bot 전체가 멈췄다. 이제 거부된 turn의 비용은 0이다. OpenAI Agents SDK 경로(API key, Bedrock)에 해당한다.

- OpenAI bot on Bedrock: `us.openai.gpt-6.x`처럼 Chat Completions에서 도구와 reasoning을 함께 받지 않는 모델이 `400 Function tools with reasoning_effort are not supported`로 실패하던 문제. 이 오류가 오면 같은 turn을 `reasoning_effort: none`으로 다시 부르고, 그 모델은 다음 turn부터 처음에 `none`으로 부른다. 이런 모델에서는 bot의 effort 설정이 적용되지 않는다.
- 연결 페이지의 Codex 카드: Codex의 `config.toml`에 `model_provider`가 `openai`가 아닌 값(예: `amazon-bedrock`)이면 ChatGPT 로그인이 없어도 오류로 표시하지 않는다. 카드 이름은 "OpenAI · Codex CLI"로 바꿨다.

### SDK

OpenAI Agents SDK: Bedrock에서 `modelSettings.reasoning.effort`에 `none`을 넘길 수 있다. 그 밖의 변경 없음.

## 0.17.0

### Added

- 설정 > 업데이트: 설치된 버전과 GitHub의 최신 akbun-taskq release를 보여 준다. 단일 바이너리로 돌면 설치 버튼으로 이 Mac(darwin-arm64)이나 linux-x64용 빌드를 받아 실행 파일을 바꾸고, 다시 시작하면 새 버전이 된다. 다운로드나 압축 풀기가 실패하면 실행 파일은 그대로다.
- 워크플로 편집기: 머리글에 취소·저장 버튼, 단축키(⌘/Ctrl+S 저장, Esc 취소, Alt+1–4 단계 추가). 바뀐 것이 있으면 나가기 전에 묻는다.

### Fixed

- OpenAI bot on Bedrock: 모델 목록을 AWS 프로파일로 조회한 inference profile(`ListInferenceProfiles`)로 채운다. `openai.*` 모델 ID를 고르거나 입력하면, 그 region에 맞는 `us.`(또는 `eu.`, `apac.` 등)이나 `global.` profile이 있을 때 그 ID로 바꿔 부른다. 새 OpenAI 모델은 profile로만 호출돼 그대로 쓰면 실패하던 문제다. API 키(`AWS_BEARER_TOKEN_BEDROCK`)만 쓰면 목록을 조회할 수 없어 내장 목록과 입력한 ID를 그대로 쓴다.

### SDK

OpenAI Agents SDK 호출 방식은 같고, Bedrock에서 넘기는 `model` 값만 inference profile ID가 될 수 있다.

## 0.16.1

### Changed

- bot 대화를 가운데 한 열(최대 820px)로 정돈했다. 머리글, 메시지, 작업 바, 입력창이 같은 폭을 쓰고, 넓은 창에서는 양옆에 여백이 생긴다. 말풍선 안쪽 여백, 줄 간격, 메시지 사이 간격을 넓혔고 bot 말풍선은 테두리 있는 카드로 보인다.

### SDK

SDK 사용 변경 없음.

## 0.16.0

### Added

- bot 대화 입력창에서 `@`를 치면 다른 bot과 공용 폴더 파일을 자동완성한다. bot을 고르면 보낼 때 그 bot에게도 같은 메시지와 파일이 간다. 파일을 고르면 그 파일이 첨부된다.

### Changed

- 상단 바를 지웠다. 앱 이름과 지난 실행 검색은 없어지고(지난 실행은 검색 dialog의 작업 탭에서 찾는다), 확인 필요(종)와 설정은 사이드바 맨 아래 오른쪽 아이콘으로 옮겼다.
- `POST /api/bots/messages`의 `attachments`가 업로드한 파일뿐 아니라 공용 폴더 안의 기존 파일도 받는다. 폴더, 없는 파일, 공용 폴더 밖 경로는 거부한다.

### Removed

- "Needs a second check"(교차 확인)를 지웠다: 새 작업의 체크박스, 작업의 `review_required`, reviewer bot 지정, bot 도구 `review_task`. bot이 done으로 끝낸 작업은 바로 done이다.

### SDK

bot 도구 `review_task`가 없어졌다. 그 밖의 SDK 사용 변경 없음.

## 0.15.0

Claude Desktop처럼 사이드바와 대화 화면을 다시 배치했다.

### Added

- bot 대화 머리글에 파일(이 대화의 파일 목록)과 브라우저 아이콘을 두었다. 누르면 대화 오른쪽 창에 열리고 다시 누르면 닫힌다. 브라우저 창은 주소를 넣어 로컬 dev server(`localhost`, `127.0.0.1`)나 https 페이지를 띄우고 새 탭으로도 연다. 그래서 UI의 CSP에 `frame-src`를 더했다. taskq 자신의 주소는 열지 않는다.
- 입력창의 `+`가 메뉴를 연다: 파일 또는 사진 추가(Cmd/Ctrl+U), 폴더 추가(`.git`·`node_modules` 제외, 200개까지, 하위 경로를 이름에 붙임), 슬래시 명령어, 플러그인.
- bot이 일하는 동안 입력창 안에 중지(■) 버튼이 보인다.
- 검색을 화면 위에 뜨는 dialog로 바꿨다(사이드바 검색, Cmd/Ctrl+K). 전체·대화·작업·Bots 탭이 있고, 입력 전에는 주의 필요(읽지 않은 bot, 승인·로그인 대기 작업), 최근 항목, 작업 메뉴(새 작업, bot 추가)를 보인다. 위아래 화살표로 옮기고 Enter로 연다.

### Changed

- Claude bot 아바타의 ✻ 표시에 Claude 주황색 배경을 넣었다.
- 메시지의 파일을 작은 칩에서 아이콘, 이름, 폴더가 보이는 카드로 바꿨다.
- 입력창을 둥근 상자 하나로 바꿨다: 왼쪽 `+`, 가운데 입력, 오른쪽 보내기. 모델, effort, 권한, context 원은 입력창 아래 오른쪽에 둔다.
- 오케스트레이터 taskq를 사이드바 위 가운데에 큰 검은 아바타와 이름으로 두었다. 누르면 그 대화가 열린다. 나머지 bot은 Bots 목록에 남는다.
- 사이드바 맨 위에 새 작업과 검색을 두고, 그 아래 모든 메뉴, 맨 아래 Bots 목록 순서로 바꿨다. 사이드바의 앱 이름은 지우고 헤더에만 남겼다. 헤더의 새 작업 버튼은 사이드바로 옮겼다.

- 새 작업 창을 줄였다: 맨 위 제목, 의도, 첨부, 폴더, Bot, Workflow, 초안, 두 번째 확인만 남겼다. 종류(Research/Task) 선택은 없애고 폴더가 있으면 `code`, 없으면 `research`로 보낸다. 추가한 뒤 작업 상세 창이 다시 열리지 않는다.
- 작업 상세를 제목, 상태·Owner·Workflow, 버튼, 승인, 의도, 파일, run, 알림만 보이게 줄였다.
- 검색 dialog의 대화 탭을 Bots 탭에 합쳤다.
- bot의 기본 작업 폴더를 공용 폴더의 `bots/<bot>`으로 옮겼다. 공용 폴더 화면에서 bot마다 작업한 것이 보인다. 설정·메모리·기록은 `TASKQ_HOME/team/<bot>`에 남는다. 이전 폴더의 세션은 이어지지 않고 새 세션으로 시작한다.
- 기본 테마를 라이트로 바꿨다. 설정 > 화면에서 다크·시스템으로 바꿀 수 있다.
- Esc는 열려 있는 맨 위 창(dialog, `+` 메뉴, 오른쪽 창)만 닫고 대화 화면은 그대로 둔다.
- PR에서는 Linux 바이너리만 빌드한다. macOS runner 대기로 PR 검사가 7분 넘게 걸리던 것을 없앴고, master에서는 두 대상을 모두 빌드한다.
- macOS에서 임시 폴더 경로(`/var`와 `/private/var`) 차이로 실패하던 테스트 2개를 고쳤다.

### Removed

- 그래프 메뉴와 화면을 지웠다. 작업 상세의 선행·후행 작업 목록도 화면에서 뺐다(`/api/graph`는 남김).
- 작업 상세의 이벤트 로그, 의존 관계, 넘김(handoff), 주의 사항.

### SDK

SDK 사용 변경 없음. bot의 기본 작업 폴더만 `TASKQ_HOME/team/<bot>`에서 공용 폴더의 `bots/<bot>`으로 바뀌었다.

## 0.14.1

impeccable(pbakaus/impeccable)의 기준으로 화면을 점검하고 걸린 항목을 고쳤다.

### Changed

- 헤더의 알림 종과 설정을 오른쪽 끝으로 옮겼다.
- 왼쪽 메뉴의 보드를 task 상태보드(Task status board)로 이름을 바꿨다.
- 사이드바, 톱니, 검색, 새로 고침, 보기 전환, 정렬, 닫기, 첨부 아이콘을 유니코드 글리프에서 한 벌의 SVG 선 아이콘으로 바꿨다.
- 상자 한쪽의 색 줄무늬(작업 카드, 캘린더 블록, 알림, 사용량 카드, 워크플로 팔레트)를 상태 색 1px 테두리와 배경 tint로 바꿨다.
- 대비 부족을 고쳤다: 알림 숫자, 선택한 bot 줄의 시각, 상태 칩, queue 아바타가 WCAG AA(4.5:1)를 넘는다.
- 텍스트 선택, caret, 스크롤바, 기본 컨트롤 색, 표와 시각의 숫자 폭을 테마에 맞췄다.
- 보드 열 모서리를 Astryx 컨테이너 반경(12px)에 맞췄다.

### SDK

SDK 사용 변경 없음.

## 0.14.0

bot이 만든 파일을 공용 폴더에 모으고, 대화에서 바로 열어 보게 한다. 공용 폴더를 파일 관리자처럼 보고 정렬한다. 디자인 시스템을 Astryx로 바꾸고 왼쪽 메뉴를 줄였다.

### Added

- bot이 만든 파일(HTML, Markdown, 슬라이드, 문서 등)은 공용 폴더의 `outputs/<bot>/`에 저장하고 `send_message`의 `files`로 넘긴다. 공용 폴더 밖의 파일은 거부한다.
- 대화의 파일 칩을 누르면 오른쪽 파일 창에 보인다. HTML은 sandbox iframe(별도 미리 보기 주소, 인라인 스타일·스크립트와 같은 폴더의 이미지·CSS 동작), Markdown은 렌더링, 이미지·텍스트는 그대로 보이고, 그 밖의 파일은 열기(이 컴퓨터의 앱)와 공용 폴더에서 보기를 제공한다.
- 공용 폴더의 보기(목록, 자세히, 아이콘)와 정렬(이름, 종류, 크기, 수정한 날짜, 오름·내림차순). 파일을 누르면 같은 파일 창에 보인다.
- `POST /api/shared/preview`(operation `file_preview`): HTML 미리 보기용 10분짜리 주소.
- `POST /api/open-file`(operation `file_open`): 공용 폴더의 파일을 이 컴퓨터의 앱으로 열거나 그 폴더를 연다.

### Changed

- 디자인 시스템을 Meta의 Astryx(neutral 테마)로 바꿨다. 색, 모서리, 그림자, 글꼴 순서를 `astryx.css`가 토큰 계약에 채운다. 이전 soft 테마는 `soft.css`로 남는다.
- 왼쪽 메뉴에서 제안, 목표, 토론을 뺐다. 기능은 API와 CLI(`taskq api proposals_list` 등)로 남는다.
- 파일 창의 열기는 문서·이미지 같은 종류만 앱으로 연다. 실행 비트가 있는 파일과 스크립트는 거부하고 공용 폴더에서 보기나 내려받기를 쓴다.

### SDK

SDK 사용 변경 없음.

## 0.13.1

### Changed

- 확인 필요(Must check)를 오른쪽 열에서 헤더의 종 아이콘으로 옮겼다. 열린 critical·high 알림과 승인 대기 수(task 승인은 알림과 겹치므로 한 번만)가 아이콘에 뜨고, 큐가 멈춰 있으면 "!"가 뜬다. 누르면 아이콘 아래에 패널이 페이지 위로 열리고(좁은 창에서도 화면 안에), Escape나 바깥 클릭으로 닫힌다. 패널에서 연 창의 Escape는 그 창만 닫는다. 알림 메시지(toast)는 패널 위에 뜬다. 오른쪽 열이 없어져 본문이 넓어졌다.
- normal 등급 알림은 화면에 보이지 않는다(배지와 목록 모두).

### SDK

SDK 사용 변경 없음.

## 0.13.0

Claude와 OpenAI bot이 이 컴퓨터의 AWS 프로파일(SSO 포함)로 Bedrock에 로그인하게 하고, 설정 화면에서 고르게 한다.

### Added

- 설정 > 연결의 "bot 로그인 방식": Claude의 provider(Bedrock, Anthropic API 키, Claude 구독), AWS 프로파일, region과 OpenAI on Bedrock의 AWS 프로파일, region. 프로파일 칸은 `~/.aws`의 프로파일을 제안한다. 저장하면 taskq.config.json보다 우선하고 다음 turn부터 적용된다. CLI·MCP(`taskq api connection_settings_set`)로 바꾸면 실행 중인 서버가 `pollSec` 안에 반영한다.
- OpenAI on Bedrock bot의 AWS 프로파일 로그인(`bots.bedrockProfile`): 프로파일의 단기 자격증명으로 Bedrock 토큰을 만들어 쓴다. 자격증명을 얻지 못하면 프로파일 종류에 맞는 고정 안내(SSO면 "aws sso login --profile …")가 대화와 연결 페이지에 뜨고(AWS SDK의 오류 문구는 `credential_process` 명령줄을 담을 수 있어 쓰지 않는다), bot은 꺼지지 않아 로그인하면 다시 동작한다. 프로파일을 비우면 전처럼 `AWS_BEARER_TOKEN_BEDROCK`을 쓴다.
- `GET/PUT /connection-settings`, `GET /aws/profiles`와 operation `connection_settings`, `connection_settings_set`, `aws_profiles`.

### SDK

`@aws/bedrock-token-generator` 1.1.0(새 의존성): `getTokenProvider({ credentials: fromIni({ profile }), region })`로 Bedrock OpenAI 호환 endpoint에 보낼 단기 bearer 토큰을 만든다. 토큰 수명은 12시간과 자격증명 수명 중 짧은 쪽이고, taskq는 10분 동안 재사용한다.

`@aws-sdk/credential-providers`(새 의존성): `fromIni({ profile })`가 SSO, assume role, credential_process, 정적 키 프로파일의 자격증명을 푼다. SSO는 `aws sso login`이 남긴 캐시를 쓴다.

`@openai/agents-openai`: `OpenAIProvider({ apiKey: <위 토큰>, baseURL: bedrock-runtime…/openai/v1 })`로 이전과 같다.

### Not verified with a real model

- 실제 SSO 프로파일로 Bedrock 호출을 해 보지 않았다. 토큰 생성은 가짜 자격증명으로 오프라인에서 형식(`bedrock-api-key-…`)만 확인했다.

## 0.12.0

bot이 사람 없이 일하는 범위를 넓히고, 사람이 결정하거나 해야 하는 곳에서는 멈추게 한다. 처음 읽는 agent는 `wiki/architecture.md`의 "Bots on their own" 절을 먼저 읽는다.

### Added

- 먼저 묻기: 되돌릴 수 없는 명령(push, publish, release, `terraform apply`·`destroy`, `kubectl apply`·`delete`, helm, `docker push`, `aws … delete-`·`terminate-`. `git -C repo push`처럼 사이에 옵션이 있어도)과 bot 설정의 "먼저 묻기" 패턴(`tool:<이름>`으로 MCP 도구도)은 실행되지 않고 Must check에 승인 요청으로 뜬다. 알림에 호출 전체가 보이고, "한 번 승인"하면 그 호출이 한 번만 통과하며, 거부하면 bot이 듣는다. 4,000자가 넘는 호출은 승인할 수 없다. bypass 모드는 기본 목록만 건너뛴다. 차단 명령처럼 글자 비교라서 사고를 막는 장치이지 경계는 아니다.
- routine: bot마다 cron 일정(로컬 시간)이나 트리거(작업 실패, 새 작업, webhook)로 도는 일. bot 설정에서 추가하거나 bot에게 대화로 부탁한다(`schedule_routine`). 놓친 실행은 한 번만 온다.
- bot 헌장: 맡는 일, 좋은 결과, 묻지 않고 하지 말 것. 지시문에 붙는다.
- 설정의 주간 점검: bot·routine별로 돌았는지와 성공률, 끌 후보와 끄기 버튼, 직접 확인할 최근 결과 5개.
- 목표: 왼쪽 메뉴에서 목표와 완료 조건을 주면 taskq가 bot에게 나눠 맡기고 `close_goal`로 요약과 함께 닫는다.
- 끝난 작업을 workflow로 저장: 작업 상세의 "Save as workflow"가 의도, 마지막 실행 요약, 쓴 명령과 고친 파일로 workflow 초안을 만들고 편집기를 연다.
- 교차 확인: "Needs a second check" 작업은 owner가 끝내면 review로 가고, 다른 reviewer bot이 `review_task`로 승인하거나 반려해야 done이 된다. reviewer bot이 없으면 사용자가 확인한다.
- API와 operation: `/bot-approvals`, `/routines`, `/goals`, `/review`, `/tasks/:id/save-workflow`.

### Changed

- bot 대화 오른쪽의 연결 패널을 뺐다. 연결은 설정의 연결 페이지에서 보고, 왼쪽 bot 목록의 이름 옆 점이 연결 상태를 보인다(초록 연결됨, 빨강 실패). 대답할 수 없는 이유는 계속 대화 안에 나온다.
- bot 목록과 대화 머리의 설정 톱니를 키우고 항상 보이게 했다(전에는 마우스를 올릴 때만 보였다).
- bot의 꺼짐 모드(`bots.enabled`)를 없앴다. bot은 taskq와 함께 항상 돌고, 멈추려면 메뉴의 Pause나 `taskq bots pause`를 쓴다. 기존 설정 파일의 `bots.enabled`는 무시한다. 연결 페이지와 bot 패널의 "bot이 꺼져 있음" 안내도 뺐다.
- 스키마 010: `team_agents`에 헌장과 `ask_first`, `bot_approvals`, `bot_routines`, `goals`, `team_messages.routine_id`.

### Fixed

- 사용자가 말을 건 bot이 "설정상 사용자에게 직접 메시지를 보낼 수 없으니 taskq를 통해 전달해 달라"고 답하던 문제. 사용자가 그 bot에게 한 번이라도 말을 걸었으면 bot은 사용자에게 직접 답한다. "May start a conversation with me" 설정(`may_message_user`)은 bot이 먼저 말을 거는 경우만 정한다. 지시문에도 사용자에게 직접 답하라고 적었다.
- bot이 일할 때 왼쪽 bot 목록이 흔들리던 문제. 목록을 몇 초마다 통째로 다시 그려 바쁜 bot의 회전 고리와 점이 처음부터 다시 돌았고, context 원이 있는 행(66px)과 없는 행(64px)의 높이가 달라 원이 생기면 아래 행이 밀렸다. 이제 보이는 내용이 바뀔 때만 다시 그리고 스크롤 위치를 유지하며, 두 줄의 높이를 고정했다.

### SDK

`@anthropic-ai/claude-agent-sdk`와 `@openai/agents-core`: 사용 방식 변경 없음. 먼저 묻기는 기존 `PreToolUse` hook(Claude)과 로컬 도구 게이트(OpenAI)에서 `botGate`가 판단한다. Codex와 Kiro bot의 자체 도구는 이 게이트를 지나지 않는다.

### Not verified with a real model

- 실제 모델이 `schedule_routine`, `review_task`를 지시문대로 부르는지는 돌려 보지 않았다. 가짜 backend와 도구 호출 테스트로만 확인했다.

## 0.11.0

bot이 대답하지 않을 때 이유를 화면에서 찾을 수 있게 한다. 처음 읽는 agent는 `wiki/architecture.md`의 Connections 절을 먼저 읽는다.

### Added

- 설정의 연결(Connections) 페이지: bot이 모델에 닿는 방법마다 카드 하나(Claude provider, OpenAI API 키, OpenAI Bedrock, ChatGPT 구독, Kiro). 상태(연결됨/실패), 무엇을 쓰는지(region, AWS 프로파일, 환경 변수, CLI), 실패 이유, 쓰는 bot, 마지막 응답과 실패한 마지막 turn을 보인다. bot이 꺼져 있거나(`bots.enabled`) 일시정지면 맨 위에 경고를 띄운다. Kiro 로그인도 이 페이지로 옮겼다.
- bot 대화 오른쪽의 연결 패널: 그 bot이 쓰는 연결과 상태, 대답하지 않는 가장 그럴듯한 이유(bot 꺼짐 설정, 일시정지, bot 꺼짐, 연결 실패, 마지막 turn 실패 순. 일하는 중이면 없고, 취소·중단된 turn은 실패로 보지 않음), 기다리는 메시지 수, 다시 확인과 연결 설정 바로 가기.
- bot 대화 안의 오류: 실패한 turn은 그 자리에 "turn 실패: <이유>"로, 서버가 거부한 내 메시지는 "보내지 못함: <오류>"로(입력은 남음), 보냈지만 bot이 지금 대답할 수 없으면 맨 아래에 "아직 대답할 수 없음: <이유>"로 보인다. 전에는 보내기 오류가 잠깐 뜨는 알림뿐이었고 실패한 turn은 대화에 보이지 않았다.
- `GET /connections`, `GET /bots/:name/connection`, `GET /bots/:name/turn-errors`와 operation `connections`, `bot_connection`, `bot_turn_errors`(CLI·MCP).

### Changed

- 설정 dialog를 한 페이지에서 왼쪽 메뉴와 오른쪽 페이지로 바꿨다. 마지막으로 연 페이지를 기억한다.

### SDK

SDK 사용 변경 없음. 연결 검사는 기존 Claude preflight(`aws sts get-caller-identity`), `codex login status`, `kiro-cli whoami`, 환경 변수 확인을 쓴다.

### Not verified with a real model

- 실제 Bedrock 프로파일, Codex, Kiro 로그인으로 검사를 돌려 보지 않았다. `codex login status`가 로그인 안 된 상태에서 0이 아닌 코드나 "Not logged in"을 내는 것을 가정했다.

## 0.10.2

bot 생성 창이 아무것도 만들지 않던 문제를 고치고, 생성 때 받는 정보를 줄인다.

### Fixed

- bot 생성 창에서 저장 버튼(Save, 이제 생성 때는 Create)을 눌러도 bot이 생기지 않고 오류도 없던 문제. 폼에 `name="sdk"` 필드가 둘(Agent SDK 선택과 Limits의 읽기 전용 표시)이라 `form.elements.sdk`가 목록이 되어 창 초기화가 실패했고, 저장 핸들러가 붙지 않아 `method="dialog"` 폼이 창만 닫았다. 기존 bot 설정의 Save도 같은 이유로 저장되지 않았다. 읽기 전용 표시를 지웠고, 폼 하나에 같은 이름의 필드가 둘이면 실패하는 테스트(`test/ui-forms.test.ts`)를 더했다.

### Changed

- bot 생성은 이름, Agent SDK(OpenAI면 로그인 방식도), 설명만 받는다. "Start from" 프리셋 선택을 화면에서 뺐다. 역할, 지시문, 모델, 권한, skill, 한도는 기본값으로 시작하고 만든 뒤 bot의 설정(톱니바퀴)에서 바꾼다. CLI `taskq bots new --preset`과 API `preset`은 그대로다.

### SDK

SDK 사용 변경 없음.

## 0.10.1

bot이 쓰는 SDK와 CLI를 2026-11-18 기준 stable 버전에 맞춘다. 코드 동작은 바뀌지 않는다.

### Changed

- `@anthropic-ai/claude-agent-sdk` 0.3.325 → 0.3.327(Claude Code v2.1.327과 같은 수준). peer인 `@anthropic-ai/sdk`는 1.8.0 → 1.10.0. 0.3.328은 `next` 태그라 쓰지 않았다.

### SDK

`@anthropic-ai/claude-agent-sdk` 0.3.327:

- 0.3.327의 breaking change 2건을 taskq 코드와 대조했다. hook 이벤트 값과 matcher의 `hooks`는 배열이어야 하는데 `src/agents/claude/hooks.ts`, `src/agents/claude/team.ts`는 이미 배열을 넘긴다. Claude Code로 보낼 수 없는 option(순환·BigInt 필드)은 거부되는데 taskq는 그런 option을 만들지 않는다.
- `createSdkMcpServer()` 서버는 top-level `mcpServers`에 둔다(agent 정의의 `mcpServers`에 넣으면 0.3.327부터 무시됨). taskq의 `team` 서버는 이미 top-level이다.
- stdio MCP server를 명령줄로 넘기는 기본값(`mcpServersDelivery: 'argv'`)은 0.3.326에서 deprecated 됐다. 내장 Claude Code를 쓰므로 지금은 그대로 두고, 기본값이 바뀌는 버전에서 다시 본다.

`@openai/agents-core`, `@openai/agents-openai` 0.22.0과 `openai` 7.60.0은 이미 최신 stable이라 바꾸지 않았다.

Codex CLI 0.170.0: `@openai/codex-sdk` 0.170.0의 `codex exec` 인자 구성(`--experimental-json`, `--config`, `--sandbox`, `--cd`, `--add-dir`, `--skip-git-repo-check`, `approval_policy`, `resume <id>`)과 `turn.completed` usage 필드가 taskq가 넘기고 읽는 것과 같다.

Kiro CLI 3.5.0: 3.0.0부터 V3가 기본이지만 `--trust-all-tools`를 쓰지 않는 스크립트는 V2로 시작한다. bypass를 뺀 모든 bot은 `--trust-tools`를 쓰므로 `--v3`를 계속 붙인다. 3.5.0의 로그인 변경(`auth.portalUrl`)은 device flow 인자에 영향이 없다.

### Not verified with a real model

- 0.3.327과 Codex CLI 0.170.0, Kiro CLI 3.5.0은 가짜 SDK·CLI 테스트로만 확인했다. Kiro는 changelog로, Codex는 SDK 패키지의 인자 구성으로 대조했다.

## 0.10.0

이 버전은 bot과 task가 실제 저장소와 문서를 다루는 방식을 넓힌다. 처음 읽는 agent는 `wiki/architecture.md`의 Task worktrees, Wiki export and import, Plugins for each SDK 절을 먼저 읽는다. 결정의 이유는 `knowledge/decisions/`의 2026-11-task-worktrees, 2026-11-wiki-transfer-jobs, 2026-11-bot-runtimes-beyond-sdks에 있다.

### Added

- task worktree. 새 작업에서 저장소나 폴더를 고른다(알려진 저장소 목록과 직접 입력). 저장소에서 코드를 고치는 작업은 기본으로 자기 worktree(`TASKQ_HOME/worktrees/<repo>-<task>`, 브랜치 `taskq/<task>`)에서 일하고, 내 checkout은 바뀌지 않는다. 끌 수 있고, 읽기만 하는 작업과 일반 폴더는 worktree를 만들지 않는다.
- 작업 상세 오른쪽의 작업 공간 패널(Claude Desktop처럼): worktree 절대 경로, 브랜치, 기준 커밋, 바뀐 파일과 파일별 diff(한글 파일명과 이름 바꾼 파일 포함), PR 링크(실행 요약이나 bot 메시지에서 찾음) 또는 GitHub 비교 링크, VS Code로 열기(`vscode://file/<path>`), 폴더 열기, worktree 삭제(커밋은 브랜치에 남고, 커밋하지 않은 변경이 있으면 한 번 더 확인한 뒤에만 지움). 저장소의 하위 폴더를 고르면 worktree 안의 같은 하위 폴더에서 일하고, `trustedRepos` 판정은 원래 저장소로 한다.
- wiki 내보내기: 모든 페이지를 front matter가 붙은 markdown과 `manifest.json`으로 zip(deflate level 9)에 담아 `shared/exports/`에 둔다.
- wiki 가져오기: zip, 폴더, 파일을 bot이 쓸 수 있게 소화한다. 문서마다 페이지, 긴 문서는 `##` 절마다 페이지(절이 없으면 길이로 나눈 여러 페이지, 버리는 글 없음), 문서 사이 상대 링크는 `[[slug]]` 링크, HTML은 글로, 코드와 데이터는 코드 블록으로, 바이너리는 건너뛰고 목록에 남긴다. 마지막에 색인 페이지를 만든다. taskq가 내보낸 zip(`manifest.json`이 있는 것)만 원래 slug로 복원한다.
- 백그라운드 job(`/api/jobs`): 내보내기와 가져오기가 진행률을 보이며 돌고, 취소하면 지금 단계 뒤에 멈추고, "마지막 단계부터 다시"로 checkpoint에서 이어 한다. taskq가 멈춘 동안 돌던 job은 다음 시작 때 이어 한다.
- Plugins 메뉴의 Claude / OpenAI 탭. skill은 두 SDK가 같이 쓰고(OpenAI bot은 `read_skill` 도구로 SKILL.md를 읽음), plugin은 Claude bot만, MCP server는 두 SDK가 같이 쓴다.
- bot용 MCP server 등록(`/api/bot-mcp-servers`)과 bot 설정의 MCP server 선택.
- OpenAI bot의 로그인 방식 선택(bot 설정의 "Sign in with"): OpenAI API 키(Agents SDK, `OPENAI_API_KEY`), Amazon Bedrock(Agents SDK, Bedrock의 OpenAI 호환 endpoint와 `AWS_BEARER_TOKEN_BEDROCK`, gpt-oss 모델, region은 `bots.bedrockRegion`), ChatGPT 구독(사용자가 설치하고 `codex login`으로 ChatGPT에 로그인한 Codex CLI를 `codex exec`로 실행). Bedrock은 서버에 대화를 두지 않으므로 taskq가 bot 폴더에 대화를 보관한다.
- Kiro bot(AWS). 설정의 Kiro 절에서 IAM Identity Center start URL과 region을 넣고 로그인하면 `kiro-cli login --use-device-flow`가 보여 주는 URL과 코드를 화면에 띄운다. bot turn은 bot 폴더에서 `kiro-cli chat --no-interactive --output-format stream-json`으로 돌고, bot은 Kiro agent 파일(역할, bot 도구 MCP, MCP server, skill)로 쓰인다. 권한 모드가 Kiro의 도구 목록과 trust 목록을 정한다.
- `taskq mcp --bot <name>`: bot 하나의 도구를 MCP server로 낸다. Codex와 Kiro bot이 이것으로 메시지, task, wiki, workflow 도구를 쓴다.
- 설정의 사용량(Usage): 기간별로 SDK(Claude, OpenAI와 로그인 방식, Kiro)마다 카드, bot 세션마다 모델·turn·입출력 토큰·비용(Kiro는 credit, ChatGPT 구독은 "구독")을 보여 준다. 일회성 작업 실행 비용도 따로 보인다.
- bot마다 context window 원(Claude Desktop처럼): 입력창 아래와 왼쪽 bot 목록에 마지막 turn이 끝났을 때 context가 찬 정도를 원과 %로 보인다. 60%와 85%에서 색이 바뀐다.
- n8n처럼 편집하는 workflow 편집기: 단계 팔레트, 끌어서 옮기는 노드, 오른쪽 점에서 다른 노드로 끌어 연결, 연결 선택 후 Delete로 삭제, 확대·이동·화면 맞춤·자동 정렬, 오른쪽 단계 속성 패널. 노드 위치는 workflow에 저장된다. 순환이 생기는 연결은 거부한다.
- `taskq api`와 MCP 도구에 task 작업 공간, 저장소 목록, wiki 내보내기·가져오기, job, MCP server 등록 operation 추가. `taskq add --no-worktree`.

### Changed

- 왼쪽 bot 목록은 bot이 많으면 목록 안에서 스크롤되고 아래 메뉴는 그대로 보인다.
- 라이트 테마에서 체크박스가 어둡게 보이던 문제(`color-scheme`)와 새 작업 종류 버튼의 대비를 고쳤다.
- OpenAI(로그인 방식별)나 Kiro bot의 로그인이 실패하면 팀 전체를 멈추지 않고 그 bot만 끄고 Must check에 알린다. Claude bot은 로그인을 함께 쓰므로 지금처럼 팀을 멈춘다. Codex와 Kiro의 실패한 turn은 turn 예산을 비용으로 잡지 않는다(0).
- bot의 Agent SDK나 OpenAI 로그인 방식을 바꾸면 세션을 새로 시작한다. 다른 런타임의 세션 id로 resume하지 않는다. 세션 초기화는 context 원과 세션 비용도 비운다.
- 짙은 보조 버튼(헤더와 Wiki의 검색 버튼, 눌린 버튼 묶음)에 짙은 글씨가 쓰이던 문제를 고쳤다. 테마 토큰에 `--on-secondary`와 `--on-danger`를 더해, 라이트 모드는 밝은 버튼에 짙은 글씨, 다크 모드는 짙은 버튼에 밝은 글씨를 쓰고, 빨간 버튼 글씨는 흰색이다.

### Security

- Codex(ChatGPT 구독)와 Kiro bot의 자체 도구 호출은 taskq 게이트를 거치지 않는다. 경계는 각자의 샌드박스와 권한이다: Codex는 plan이 read-only, accept edits가 bot 폴더·공용 폴더·worktree 쓰기(workspace-write), bypass가 전체 접근이고 승인은 묻지 않는다(`approval_policy=never`). Kiro는 trust 목록 밖의 도구를 거부하고 샌드박스 설정이면 `--sandbox`를 붙인다. bot 도구(메시지, task 등)는 `taskq mcp --bot`에서 다른 bot과 같은 검사를 거친다.
- taskq는 ChatGPT, AWS SSO, Bedrock의 토큰을 저장하지 않는다. Codex와 kiro-cli가 각자 보관하고, Bedrock 키는 환경 변수로 받는다.
- MCP server는 내 권한으로 bot 게이트 밖에서 돈다(plugin의 MCP server와 같음). 믿는 서버만 등록하고 키는 환경 변수에 둔다고 화면에 적었다.
- worktree를 지워도 task는 지워진 폴더를 가리키므로, 다시 실행하면 내 checkout에 쓰지 않고 실패한다. diff API는 바뀐 파일 목록에 있는 파일만 보여 준다.
- 가져오기는 zip 항목 5,000개, 풀린 크기 200 MB, 폴더 파일 5,000개·파일당 5 MB까지이고 symlink와 숨김 폴더를 따라가지 않는다. zip 안의 `..` 경로는 버린다.

### SDK

`@anthropic-ai/claude-agent-sdk`:

- `mcpServers`: `team` 서버 옆에 bot이 고른 MCP server를 `{ type: 'stdio', command, args }`로 넣는다.
- `additionalDirectories`와 샌드박스 `allowWrite`에 `TASKQ_HOME/worktrees`를 더해 bot이 task worktree에서 일하게 한다.

`@anthropic-ai/claude-agent-sdk`(이어서):

- `SDKAssistantMessage.message.usage`와 `result.modelUsage[model].contextWindow`: 마지막 모델 호출의 입력(캐시 포함)과 모델의 context window로 context 원을 그린다. turn의 토큰은 result의 `usage`를 더한다.

`@openai/agents-core`, `@openai/agents-openai`:

- `OpenAIProvider({ apiKey, baseURL, useResponses: false })`: Bedrock bot은 `https://bedrock-runtime.<region>.amazonaws.com/openai/v1`의 Chat Completions로 돈다. 대화는 `result.history`를 bot 폴더에 저장했다가 다음 turn의 입력 앞에 붙인다(최대 200개 항목).
- `result.rawResponses.at(-1).usage.inputTokens`: context 원.
- `MCPServerStdio`와 `Agent({ mcpServers })`: bot이 고른 MCP server를 turn마다 bot 작업 디렉터리에서 시작하고 turn 뒤에 닫는다.
- `tool()`: `read_skill` 도구. bot의 skill 이름과 설명을 도구 설명에 두고, 부르면 SKILL.md와 옆 파일 목록을 돌려준다(Claude Code의 skill처럼 필요할 때 읽음).

Codex CLI(ChatGPT 구독, SDK 패키지 없이 `@openai/codex-sdk`와 같은 인자로 실행): `codex exec --experimental-json`, `--sandbox`, `--cd`, `--add-dir`, `--skip-git-repo-check`, `--config approval_policy="never"`, `model_reasoning_effort`, `developer_instructions`(bot의 역할과 규칙), `mcp_servers.*`(bot 도구와 MCP server), `resume <thread_id>`. `thread.started`의 thread id가 세션이고 `turn.completed`의 `usage`가 토큰이다. `@openai/codex-sdk`를 의존성으로 넣지 않은 이유는 플랫폼별 Codex 바이너리(약 400 MB)를 함께 설치하기 때문이다.

Kiro CLI: `kiro-cli chat --v3 --no-interactive --output-format stream-json --agent taskq-<bot>`, `--model`, `--effort`, `--resume`/`--resume-id`, `--trust-tools=…`/`--trust-all-tools`, `--sandbox`; 로그인은 `kiro-cli login --identity-provider <url> --region <region> --use-device-flow`, 상태는 `kiro-cli whoami`. agent 파일은 `name`, `description`, `prompt`, `mcpServers`, `tools`, `resources`(`skill://`), `includeMcpJson: false`.

### Not verified with a real model

- Codex, Kiro, Bedrock은 실제 계정으로 돌려 보지 않았다. 특히 Kiro의 stream-json 기록 형식은 문서에 없어 세션 id, 토큰, credit, context를 아는 이름의 필드에서만 읽는다(못 찾으면 빈 값). Kiro headless가 SSO 로그인 세션으로 도는지는 문서가 말하지 않는다(문서는 API 키를 권하고, 로그인 세션이 API 키보다 먼저 쓰인다고 적는다).
- OpenAI 모델의 context window는 taskq가 아는 값으로 그린 추정이다. Codex는 `turn.completed`가 turn의 모든 호출을 더한 값이라 context 원을 그리지 않는다. Kiro는 보고하는 비율(%)만 그린다.
- bot이 `start_task`가 알려 준 worktree 경로에서 실제로 일하고 커밋하는지, OpenAI bot이 MCP server 도구와 `read_skill`을 쓰는지. 테스트는 가짜 SDK로 돈다.
- MCP server 시작은 실제 서버로 돌려 보지 않았다. 테스트는 세션 옵션과 turn 요청에 들어가는지만 본다.

## 0.9.0

이 버전은 task 큐 위에 역할을 가진 상주 bot을 더한다. 처음 읽는 agent는 `wiki/architecture.md`의 Bots 절과 `wiki/sdk-usage.md`를 먼저 읽는다. 결정의 이유는 `knowledge/decisions/`의 2026-11-bots-execute-tasks, 2026-11-resident-agent-team, 2026-11-task-ownership-and-discussions, 2026-11-wiki-hybrid-search, 2026-11-soft-theme-sidebar, 2026-11-bot-workspace, 2026-11-workflows-run-by-bots, 2026-11-openai-bot-backend, 2026-11-operations-for-cli-and-mcp에 있다.

### Added

- 상주 bot. bot마다 역할, 설명, 지시, 자기 Claude 세션을 갖고, 메시지가 올 때마다 그 세션을 이어서(`resume`) 한 turn 일한다. 프로세스를 띄워 두지 않으므로 taskq를 다시 시작해도 대화가 이어지고, 쉬는 bot은 비용이 없다. `bots.enabled`로 켜며 기본은 꺼져 있다.
- 오케스트레이터 bot `taskq`. 처음부터 있고, 지우거나 끌 수 없고, 목록 맨 위에 고정된다. 나머지 bot은 사용자가 만들고 지운다(planner, coder, reviewer, doc-reviewer 프리셋).
- bot이 task를 직접 처리한다. owner bot만 `start_task`로 시작하고 같은 turn 안에서 `finish_task`로 done, review, failed 중 하나로 닫는다. 실행은 `runs.bot`에 남아 Calendar에 보인다. turn이 끝날 때 닫지 않은 task는 ready로 돌아가고, 지운 bot의 task는 owner 없는 draft가 된다.
- bot별 설정: 권한 모드(기본 auto), 샌드박스(기본 끔)와 허용 호스트, 차단 명령(기본 없음, 명령 어디에 있어도 매칭), 작업 디렉터리, 모델, 시간당 turn·turn당 예산·turn당 모델 턴 제한, skill과 plugin 선택.
- bot 사이 비동기 mailbox, `deliver_at` 예약 메시지, 순서와 라운드가 정해진 토론(moderator가 결론을 wiki에 남김).
- task owner. task 하나에 bot 하나. Board 배지, task 상세의 owner 변경, bot 대화의 작업 칩. 비슷한 열린 작업을 만들면 거절(글자 trigram 유사도 0.5, 권고 수준).
- 공유 wiki. revision 비교로 동시 쓰기를 막고, trigram 검색(한국어 조사 포함)과 `[[slug]]` 링크 1단계 확장, `TASKQ_HOME/wiki/` markdown 사본(graphify 같은 도구용).
- bot 메모리. bot마다 16,000자까지, 매 turn system prompt에 붙고 bot은 `memory_write`로, 사용자는 우클릭 메뉴의 메모리 창으로 고친다.
- 공용 폴더 `TASKQ_HOME/shared`. 모든 bot 세션에 같은 경로로 연결되고(`additionalDirectories`), 왼쪽 메뉴의 공용 폴더에서 보고 올리고 내려받는다.
- 첨부파일. 새 작업과 bot 대화에서 끌어다 놓기, 붙여넣기(스크린샷 포함), 파일 선택으로 올리고 `shared/attachments/`에 저장한다. 작업과 bot의 프롬프트에 절대 경로가 들어간다.
- 모든 bot 대화 검색(왼쪽 메뉴의 검색 아이콘, Cmd/Ctrl+K). trigram 색인을 trigger로 유지하고 짧은 단어는 LIKE로 찾는다. 결과를 누르면 그 대화의 그 메시지로 이동한다.
- 대화 안 찾기(Cmd/Ctrl+F), 작업 중 표시(사이드바 아바타 둘레의 회전 고리와 경과 시간, 대화 아래의 작업 바), Esc와 Stop으로 turn 취소.
- 글로벌 설정: 언어(한국어 기본, 영어), 테마(시스템, 다크, 라이트), 글꼴과 크기, 전체·bot별 사용량 제한, 큐 자동 실행, bot용 skill·plugin 등록과 업데이트(`git pull --ff-only` 후 사용하는 bot 재로드), 공용 폴더·세션 대화 기록·데이터 폴더 열기.
- bot 우클릭 메뉴: 대화 열기, 설정, 메모리, skill·plugin 다시 불러오기, 새 세션, 세션 폴더 열기, 진행 중 작업 취소, 끄기·켜기, 삭제.
- bot 아바타 오른쪽 아래에 실행 SDK 표시(Claude ✻, OpenAI ◎). 왼쪽 bot 목록에 두 SDK의 bot이 함께 보인다.
- OpenAI bot. bot 설정의 Agent SDK에서 OpenAI Agents SDK를 고르면 같은 mailbox, 도구, 제한, 게이트로 돈다. auto 모드가 없어서 권한 모드(plan, accept edits, bypass)가 bot이 받는 파일·셸 도구를 정한다. `OPENAI_API_KEY`가 필요하고, 비용은 토큰 수와 `bots.openaiInputPerMTok`·`openaiOutputPerMTok`로 추정한다.
- 일하는 bot에게 보낸 메시지는 기다리지 않고 진행 중인 turn에 들어간다(Claude bot, 한 turn에 최대 10번). OpenAI bot과 빈 turn 자리를 기다리는 bot의 메시지는 큐에 쌓이고, 대화 아래와 bot 목록에 대기 수가 보인다.
- 입력창 아래 메뉴(Claude Desktop처럼): 모델 목록 불러오기와 선택, effort, 권한 모드. 바꾸면 다음 turn부터 적용된다. 새로고침 아이콘은 skill·plugin을 다시 읽고 모델·명령 목록을 새로 불러온다.
- slash command. 입력창에 `/`를 치면 bot의 skill과 plugin 명령 목록이 뜨고, `/이름 인자`로 보낸 메시지는 bot이 그 skill로 처리한다.
- Plugins 메뉴(Claude Desktop처럼). 등록한 skill·plugin 보기, 쓰는 bot 표시, 업데이트, 삭제, 경로로 등록. Anthropic 공식 marketplace 목록을 보여 주기만 하고 설치하지 않는다.
- Workflows 메뉴(n8n처럼 단계 그래프를 만들고, Argo처럼 실행 기록을 본다). 단계 종류는 실행, 검증(증거 필요), 다른 bot에 넘김, 사용자 승인. task에 workflow와 bot을 지정하면 그 bot이 `start_task`에서 실행을 시작하고 단계마다 보고한다. 성공은 bot이 아니라 taskq가 판정한다(검증 단계는 증거, 승인 단계는 사용자 승인, 단계 하나라도 실패하면 실행 실패). 삭제한 workflow는 실행 기록에 삭제됨으로 남고, 그 workflow를 실행 중인 bot은 메시지를 받는다. bot 없는 workflow task는 큐가 실행하지 않는다.
- `taskq bots` 명령: list, new, delete, reload, say, inbox, log, turns, threads, close, wiki, search, export, assign, pause, resume, enable, disable, reset.
- CLI와 MCP로 모든 기능. API 경로마다 이름 붙은 operation(`src/ops/operations.ts`)이 있고, `taskq api <operation> key=value...`와 MCP 도구 `taskq_<operation>`이 같은 표를 쓴다. `taskq workflows`는 workflow를 읽기 쉽게 다루는 명령이다. 경로가 operation에 빠지면 테스트가 실패한다.
- 다른 프로세스(CLI, MCP 서버)에서 bot turn을 취소할 수 있다. 취소 표시를 DB에 남기고 bot을 돌리는 프로세스가 다음 tick에 멈춘다.

### Changed

- 작업 취소는 이제 `cancelled` 상태다(이전에는 failed). failed처럼 다시 시도할 수 있다.
- 큐는 bot이 owner인 task를 자동 실행하지 않는다. owner 없는 ready task의 자동 실행은 설정의 큐 항목으로 끌 수 있다. task의 시작 버튼은 어느 bot에도 속하지 않는 일회성 실행으로 그대로다.
- 화면: 탭 줄 대신 왼쪽 메뉴, 기본 테마는 다크 우선의 둥근 soft 테마(Carbon 테마 파일은 남음), 새 작업의 입력창은 내용에 맞춰 늘어난다.

### Security

- 설정과 관계없이 모든 bot에서 taskq 자신을 건드리는 호출은 그 turn을 멈추고 bot 전체를 멈춘다(`security_finding`). 파일 도구는 경로로, 셸 명령은 데이터 디렉터리·`taskq.db`·`taskq.config.json`을 가리키는 글자로 판단한다. `~/.claude`를 가리키는 셸 명령은 거부한다. 글자 검사는 우회될 수 있고, 확실한 경계는 bot 샌드박스다.
- bot은 사용자의 Claude 설정(`settingSources: []`)을 읽지 않는다.
- skill·plugin 다시 불러오기는 bot 폴더 경로에 symlink가 있으면 거부한다(bot이 심은 symlink로 TASKQ_HOME 밖을 지우는 것을 막음).
- 업로드와 공용 폴더 경로는 공용 폴더 밖으로 나갈 수 없다.
- bot의 셸에서 `taskq` 명령은 거부한다. `taskq api`로 자기 권한, 예산, 승인을 바꿀 수 있기 때문이다(글자 검사라 우회 가능).
- workflow의 검증·승인 단계는 bot이 건너뛸 수 없고, 실행이 실패하거나 취소된 task는 failed로만 닫힌다. workflow가 있는 task는 시작 버튼(일회성 실행)으로 돌릴 수 없다.
- OpenAI bot의 파일·셸 도구도 Claude bot과 같은 게이트를 거친다. `write_file`은 작업 디렉터리와 공용 폴더 안에만 쓰고, `shell`은 bypass 모드이면서 샌드박스를 끈 bot에게만 준다(taskq는 자식 프로세스를 Claude Code처럼 샌드박스에 넣지 못함).

### SDK

`@anthropic-ai/claude-agent-sdk`를 어떻게 쓰는지의 전체 표는 `wiki/sdk-usage.md`에 있다. 이 버전에서 새로 쓰거나 쓰는 방식이 바뀐 것:

- `query()`와 `resume`: bot 한 turn이 query 한 번이다. 세션 id를 `team_agents.session_id`에 두고 다음 turn에 이어 붙인다. 세션이 사라졌다는 오류면 다음 turn에 새 세션을 시작한다. resume한 세션의 `total_cost_usd`는 이전 turn까지의 누적을 포함하므로, 세션의 직전 누적(`team_agents.session_cost_usd`)과의 차이를 turn 비용으로 기록한다.
- 스트리밍 입력(`AsyncIterable<SDKUserMessage>`): in-process MCP 도구는 스트리밍 입력에서만 동작한다. stream을 turn 동안 열어 두고, 일하는 중에 온 메시지를 같은 stream에 넣는다(`src/team/live-input.ts`). 넣는 메시지마다 `uuid`를 붙이고, `result`의 `user_message_uuids`로 답한 메시지를 지운다(SDK가 가까이 온 메시지를 한 turn으로 합칠 수 있음). 답하지 않은 메시지가 없고 `queued_turn_count`가 0이면 stream을 닫아 turn을 끝낸다. `num_turns`는 result마다 더하고, `total_cost_usd`는 세션 누적값이라 마지막 값을 쓴다.
- `Query.supportedModels()`와 `supportedCommands()`: 프롬프트 없이 연 세션에서 모델 목록(effort 지원 여부 포함)과 slash command를 읽어 입력창 메뉴에 쓴다(10분 캐시, 새로고침으로 다시 읽음). 읽지 못하면 내장 목록을 쓰고 그렇다고 표시한다.
- `effort`: bot별 effort(low부터 max)를 세션에 넘긴다.
- `createSdkMcpServer()`와 `tool()`: bot 도구 20개(메시지, 토론, task, wiki, 메모리, workflow)를 `team` 서버로 노출한다. 입력 zod 스키마는 taskq도 handler 전에 다시 검사한다.
- `hooks.PreToolUse`: bot 게이트(tamper 정지, 차단 명령). permission mode보다 먼저 돌고 거부는 모든 모드에서 유지된다.
- `permissionMode`(bot 기본 `auto`), `allowDangerouslySkipPermissions`(bypass를 고른 bot만), `canUseTool`(bot은 승인 대기 없이 거부).
- `sandbox`: bot이 켰을 때만. 쓰기는 작업 디렉터리와 공용 폴더, taskq 데이터 읽기 거부, 네트워크는 허용 호스트.
- `plugins`: bot이 고른 skill을 복사해 만든 로컬 plugin 하나와 고른 plugin들. `strictMcpConfig`는 plugin이 있을 때만 끈다.
- `additionalDirectories`: 공용 폴더. `settingSources: []`, `maxTurns`, `maxBudgetUsd`(bot별 제한), `model`(bot별), `systemPrompt`(claude_code preset에 역할, bot 목록, 규칙, 메모리를 덧붙임).
- 쓰지 않는 것: subagent(`agents`)와 SDK 메모리 파일. 이유는 `wiki/sdk-usage.md`의 마지막 절.

`@openai/agents-core`와 `@openai/agents-openai`(OpenAI Agents SDK, 0.22.0)는 OpenAI bot에 쓴다(`src/agents/openai/team.ts`):

- `Runner`와 `OpenAIProvider`: bot turn 하나가 `runner.run()` 한 번이다. `tracingDisabled: true`로 OpenAI tracing에 대화를 보내지 않는다.
- `previousResponseId`와 `lastResponseId`: Responses API가 대화를 서버에 두므로, 마지막 response id를 bot의 세션 id로 저장해 다음 turn에 넘긴다. 없어졌다는 오류면 다음 turn은 새 대화로 시작한다.
- `tool()`: bot 도구 20개와 파일·셸 도구를 JSON schema(`strict: false`)로 넘긴다. zod 스키마는 `z.toJSONSchema()`로 바꾸고 handler 전 검사는 Claude bot과 같다.
- `maxTurns`, `signal`(취소), `modelSettings.reasoning.effort`(bot의 effort), `runContext.usage`(토큰 수로 비용 추정), `MaxTurnsExceededError`.
- 쓰지 않는 것: `@openai/agents`의 realtime 패키지, handoff(bot 사이 일은 mailbox로), hosted tool.

### Not verified with a real model

- resume한 세션의 transcript에 누적 비용이 없을 때의 비용 계산(직전 누적보다 작으면 전체를 turn 비용으로 봄), resume한 세션에도 `PreToolUse` 거부와 플러그인이 그대로 적용되는지, auto 모드가 셸로 taskq 파일을 건드리는 시도를 막는지. 테스트는 가짜 SDK로 돈다.
- 실행 중인 turn에 넣은 메시지가 `user_message_uuids`로 돌아오는지(돌아오지 않으면 가장 오래된 메시지를 답한 것으로 봄), 프롬프트 없는 세션에서 `supportedModels()`가 응답하는지(응답하지 않으면 20초 뒤 내장 목록으로 대체).
- OpenAI bot은 실제 API로 돌려 보지 않았다. 비용은 설정한 단가로 계산한 추정치다.

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
