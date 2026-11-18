# akbun-taskq 사용 매뉴얼

태스크를 쌓아 두면 여러 Claude 세션이 병렬로 처리하고, 한 화면에서 언제 무엇이 실행됐는지와 내가 확인할 것을 보는 개인용 도구다. 이 문서는 처음 설치해서 쓰는 순서대로 적었다. 모든 명령은 `workspace/` 디렉터리에서 실행한다.

이 문서에서 `taskq <명령>`이라고 적은 것은 `node bin/taskq <명령>`을 줄여 쓴 것이다. 어디서나 `taskq`로 쓰려면 `workspace/`에서 `npm link`를 한 번 실행한다.

## 1. 먼저 화면부터 보기

실제 에이전트를 돌리지 않고 가짜 데이터로 모든 화면을 볼 수 있다. 설정 없이 바로 된다.

의존성을 설치한다.

```bash
npm ci
```

데모를 띄운다.

```bash
npm run demo
```

터미널에 출력된 `http://127.0.0.1:4599/#token=...` 주소를 그대로 브라우저에 연다. 데모는 큐가 멈춘 상태로 뜨므로 어떤 세션도 시작되지 않는다. `Ctrl-C`로 끄면 임시 데이터도 지워진다.

## 2. 준비물

- Node 24 이상. TypeScript 소스를 빌드 없이 바로 실행한다. 바이너리를 쓰면 Node와 checkout이 필요 없다.
- Claude Code 설치.
- 모델에 접근할 방법 하나: Amazon Bedrock, Anthropic API 키, Claude 구독 로그인 중 하나.
- macOS, Linux 또는 Windows의 WSL2. 세션은 Claude Code 샌드박스 안에서 돌고, 샌드박스를 쓸 수 없으면 시작하지 않는다.

바이너리는 GitHub Release의 `akbun-taskq-v<버전>`에 있다. Apple silicon은 `taskq-darwin-arm64.tar.gz`, linux x86_64는 `taskq-linux-x64.tar.gz`다. 화면, DB 스키마, 버전이 맞는 Claude Code가 파일 하나에 들어 있다. 압축을 풀어 PATH에 두고, macOS에서 브라우저로 받았으면 한 번 격리 속성을 지운다.

```bash
tar -xzf taskq-darwin-arm64.tar.gz
xattr -d com.apple.quarantine taskq
```

바이너리를 쓰면 이 문서의 `node bin/taskq`를 `taskq`로 바꿔 읽는다. `taskq version`이 taskq와 들어 있는 Claude Code의 버전을 출력한다. 설정 파일과 `TASKQ_HOME`은 같다. 들어 있는 Claude Code는 첫 세션 때 임시 디렉터리에 한 번 풀린다.

## 3. 설정 파일 만들기

예시 파일을 복사한다.

```bash
cp taskq.config.example.json taskq.config.json
```

`taskq.config.json`에서 `provider`를 고른다. taskq는 키나 토큰을 읽거나 저장하지 않고, 세션에 넘길 환경 변수만 정한다.

| provider | 내가 할 일 |
|---|---|
| `bedrock` | `awsRegion`과 `inferenceProfile`(모델 호출에만 쓰는 AWS 프로파일)을 적는다 |
| `api_key` | taskq를 실행하는 셸에 `ANTHROPIC_API_KEY`를 설정한다 |
| `subscription` | 할 일 없음. 이미 로그인된 Claude Code를 쓴다 |

자주 손대는 값은 아래와 같다. 바꾼 뒤에는 taskq를 다시 시작한다.

| 키 | 기본값 | 뜻 |
|---|---|---|
| `agent` | claude | 태스크를 실행할 agent SDK. 지금은 `claude`만 있다 |
| `maxConcurrent` | 3 | 동시에 실행할 태스크 수 |
| `pollSec` | 60 | 다른 프로세스(CLI)가 바꾼 내용을 확인하는 간격. 화면과 API로 바꾼 내용은 바로 반영된다 |
| `maxTurns`, `maxBudgetUsd` | 60, 5 | 태스크 하나의 턴 수와 비용 상한 |
| `autoMode` | true | `auto` 권한 모드를 쓸 수 없는 계정이면 false |
| `sandbox.allowedDomains` | [] | 샌드박스 안의 명령이 접속할 수 있는 호스트. AWS 엔드포인트를 여기에 넣는다 |
| `prodLockKeys` | [] | 운영으로 취급할 lock key. 여기서 실패하면 critical 알림이 뜬다 |
| `trustedRepos` | [] | 저장소 자체의 Claude 설정까지 로드해도 되는 저장소의 절대 경로 |
| `retrospect` | true | 태스크가 끝난 뒤 메모 제안을 만들지 여부 |
| `port` | 4517 | 화면과 API의 포트 |
| `bots.enabled` | false | 상주 bot을 켠다. 자세한 값은 "10. bot에게 맡기기"에 있다 |
| `caBundle` | 없음 | 회사 TLS 검사 장비의 CA를 포함한 PEM 파일의 절대 경로. 세션의 `AWS_CA_BUNDLE`(aws CLI)과 `NODE_EXTRA_CA_CERTS`(Claude Code)에 함께 들어간다 |

데이터는 실행한 디렉터리 아래에 생긴다. 다른 곳에 두려면 `TASKQ_HOME`을 지정한다.

| 위치 | 내용 |
|---|---|
| `data/taskq.db` | 모든 태스크와 실행 기록. SQLite 파일 하나 |
| `outputs/` | 조사 문서와 리뷰 문서 |
| `memory/` | 적용한 메모 제안 |
| `team/<bot>/` | bot마다 하나인 작업 폴더. 세션의 작업 디렉터리다 |
| `wiki/` | bot wiki의 markdown 사본. graphify 같은 도구가 읽는다 |

## 4. 실행하기

큐와 화면을 함께 시작한다.

```bash
node bin/taskq run
taskq bots list | new NAME [--preset P] | delete NAME | reload NAME [skill|plugin] | say [--to NAME] TEXT | inbox | log | turns
taskq bots threads | close THREAD | wiki [SLUG] | search QUERY | export
taskq bots assign TASK AGENT|user | pause | resume | enable NAME | disable NAME | reset NAME
```

출력된 주소를 연다. 주소 끝의 `#token=...`은 실행할 때마다 바뀌고, 이 토큰이 없으면 화면이 데이터를 받지 못한다. 서버를 다시 시작했다면 새로 출력된 주소로 다시 연다.

## 5. 계정 접근 skill 등록하기

계정에 어떻게 접근하는지는 내 Claude Code skill이 정한다. taskq에는 그 skill의 위치만 등록한다. 여러 개를 등록할 수 있다.

- 화면: 오른쪽 위 Settings → Access skills의 `+`를 누르면 `~/.claude/skills`에서 찾은 skill이 나온다. Add로 추가하고, 다른 위치에 있으면 절대 경로를 입력한다. `−`로 등록을 해제한다. skill 파일은 지우지 않는다.
- 명령: 아래처럼 한다.

```text
taskq skills discover          찾을 수 있는 skill 보기
taskq skills add <경로>        등록
taskq skills list              등록된 것 보기
taskq skills remove <이름>     등록 해제
```

skill은 `SKILL.md`가 들어 있는 폴더다. 조회 전용 태스크에서는 `aws sso login` 같은 로그인 명령이 막혀 있으므로, 로그인은 내가 터미널에서 하고 skill에는 어떤 프로파일로 접근하고 어떻게 확인하는지를 적는다.

## 6. 태스크 추가하기

화면에서는 New task를 누른다. 기본 입력은 세 가지다.

- Type: Research 또는 Task.
- Intent: 무엇을 할지, 무엇을 조심할지.
- Save as draft: 켜 두면 초안으로 저장되고 실행되지 않는다. 끄면 바로 대기열에 들어간다.

Task를 고르면 Access skill을 선택할 수 있다. 나머지는 More options에 있다.

| Type | 세션이 할 수 있는 일 |
|---|---|
| Research | 읽고 검색하고 `outputs/` 아래에 문서를 쓴다 |
| Task, Change an account (기본) | 계정을 조회하고, 변경 명령은 하나씩 내 승인을 기다린다 |
| Task, Read an account only | 조회 명령만 실행한다. 변경은 거부된다 |
| Task, Work in a repository | 저장소 하나 안에서 작업한다. 끝나면 보안 리뷰 태스크가 자동으로 생긴다 |

명령으로 추가하면 초안이 아니라 바로 대기열에 들어간다. 초안으로 넣으려면 `--draft`를 붙인다.

조사 태스크를 추가하는 예시다.

```bash
node bin/taskq add --type research --intent "A와 B를 비교해 정리" --output compare.md
```

계정 조회 태스크를 추가하는 예시다.

```bash
node bin/taskq add --type ops_read --access-skill example-readonly --target-profile example-dev --lock-key example-dev --intent "비용이 큰 리소스 상위 5개 조회"
```

`--lock-key`가 같은 태스크는 동시에 실행되지 않는다. 계정이나 저장소 이름을 쓴다. `--depends-on <id>`를 주면 그 태스크가 끝난 뒤에 실행된다.

### 검토한 산출물을 다음 태스크에 전달

조사 태스크의 Output path에 `intent.md`를 지정하고, 설계 태스크의 Depends on에 조사 태스크 ID를 넣는다. 조사 결과를 읽고 Mark done을 누르면 설계 태스크가 실행 ID, 요약, `outputs/intent.md` 경로를 받아 작업한다. 설계 결과를 `spec.md`로 만든 뒤 같은 방식으로 구현 태스크를 연결한다. 설계 문서에 완료 조건과 확인할 테스트를 적으면 구현 태스크가 그 기준으로 결과를 검증할 수 있다.

`outputs/`의 파일은 로컬에 저장된다. 파일의 검토 당시 버전을 보관하려면 저장소에서 별도로 커밋한다. [Anthropic AI-native SDLC 플레이북](https://claude.com/ko/resources/articles/the-ai-native-sdlc-playbook)

### 인계 알림과 수락

새 인계는 Must check 패널과 태스크 상세의 Handoffs에 기록된다. macOS와 Windows에서는 시스템 알림도 뜬다. Windows에서 WSL2로 taskq를 실행할 때는 WSL의 Windows 상호 운용이 활성화되어 있고 `powershell.exe`가 WSL의 PATH에 있어야 한다. Handoffs에서 발신·수신 태스크, 산출물 경로, 도착 시각, 수락 방식과 시각을 확인할 수 있다.

자동 수락은 기본으로 켜져 있다. 태스크에서 Automatically accept incoming handoffs를 끄면 Accept handoff를 누르기까지 실행이 대기한다. 다시 켜면 현재 대기 중인 인계를 수락한다. 선행 태스크를 재실행하면 새 산출물은 새 인계로 기록된다.

CLI에서 기록을 읽고 수락 모드를 바꾸거나 인계를 수락한다.

```text
taskq handoffs [--task TASK_ID]
taskq handoff mode TASK_ID [auto|manual]
taskq handoff accept HANDOFF_ID
```

`taskq add`에서 처음부터 직접 수락하려면 `--manual-handoffs`를 붙인다. AI 클라이언트에는 실행 파일의 절대 경로로 `taskq mcp`를 stdio 서버로 등록하고 `TASKQ_HOME`에 같은 데이터 디렉터리를 지정한다. 도구는 `taskq_list_handoffs`와 `taskq_handoff_mode`다.

## 7. 확인하고 처리하기

오른쪽 Must check 패널에 내가 봐야 할 것이 심각도 순으로 쌓인다. 인계와 중요 경고의 시스템 알림은 Settings → Notifications → Desktop notifications에서 끄거나 켤 수 있다. 기본값은 켜짐이며 끈 상태에도 앱 내 기록은 남는다. 다시 켜면 이후의 알림부터 표시한다. 인계와 경고 처리는 화면이나 명령에서 한다.

| 상황 | 화면 | 명령 |
|---|---|---|
| 변경 명령 승인 대기 | Review → 명령 전문 확인 → Approve 또는 Deny | `taskq approve <id>`, `taskq deny <id>` |
| 계정 로그인 만료 | 터미널에서 로그인 후 Resume | `taskq resume <id>` |
| 산출물 검토 대기 | 문서를 읽고 Mark done | `taskq done <id>` |
| 실패 | 태스크 상세의 Retry | `taskq retry <id>` |
| 실행 중인 것을 멈추기 | 태스크 상세의 Cancel task | `taskq cancel <id>` |
| 새 실행을 전부 멈추기 | Pause queue | `taskq pause`, `taskq unpause` |

승인할 때는 실제로 실행될 명령이 한 글자도 빠짐없이 보인다. 숨은 문자가 있으면 표시되고, 명령이 길면 끝까지 읽어야 Approve가 켜진다. 승인은 화면에 보인 그 요청에만 적용된다.

## 8. 화면 둘러보기

| 왼쪽 메뉴 | 보는 것 |
|---|---|
| Calendar | 언제 무엇이 실행됐는지. Day, Week, Month로 바꾸고 Today로 돌아온다. 빗금은 내 승인이나 로그인을 기다린 시간이다 |
| Board | 상태별 태스크 카드 |
| Graph | 태스크 사이의 의존 관계 |
| Proposals | 태스크가 끝난 뒤 올라온 메모 제안. 내용을 보고 Apply 또는 Reject |
| Bots (왼쪽 메뉴) | bot마다 채팅방처럼 최근 메시지와 시각을 보인다. bot을 누르면 대화 전체가 열리고 거기서 메시지를 보낸다. 맡은 작업은 대화 위에 칩으로 보인다 |
| Discussions | bot끼리의 토론. 다음 차례, 결론, 결론 없이 닫기 |
| Wiki | bot이 함께 쓰는 기록. 검색과 본문 보기 |
| Settings | 접근 skill, 데이터베이스 위치, 현재 설정값(읽기 전용) |

위쪽 검색창은 지난 실행의 요약을 찾는다.

Proposals는 "다음에도 쓸 만한 것"을 정리한 메모다. Memory note는 적용하면 `memory/` 아래 파일에 덧붙고, Skill note는 skill 폴더에 `proposed-<시각>.md`로 저장된다. 기존 `SKILL.md`는 바뀌지 않으므로 반영은 직접 한다.

## 9. 명령 한눈에 보기

```text
taskq add --type T --intent TEXT [--title --cautions --access-skill --target-profile --lock-key --repo --output --priority --depends-on --draft]
taskq list [--status S]      taskq show ID
taskq approve ID             taskq deny ID
taskq resume ID              taskq done ID
taskq cancel ID              taskq retry ID [--draft] [--resume]
taskq pause [--reason TEXT]  taskq unpause
taskq alerts                 taskq log [--date YYYY-MM-DD]
taskq search QUERY           taskq skills list | add PATH | remove NAME | discover
taskq run
```

`T`는 `research`, `ops_read`, `ops_change`, `code`, `security_review` 중 하나다.

## 10. bot에게 맡기기

bot은 역할을 가진 상주 Claude 세션이다. 태스크는 내 작업 노트이고, bot이 자기가 맡은(owner) 태스크를 가져가 직접 처리한 뒤 결과를 남긴다. 처음에는 오케스트레이터 bot `taskq` 하나만 있다. taskq에게 목표를 말하면 태스크로 나눠 알맞은 bot에게 맡기고, 끝나면 결과를 알려준다. 다른 bot은 내가 만든다.

화면 왼쪽 메뉴의 Bots에서 bot을 누르면 그 bot과의 대화를 메신저처럼 본다. `+`로 bot을 만들고, bot의 톱니나 오른쪽 버튼 메뉴로 설정, skill·plugin 다시 불러오기, 새 세션, 끄기, 지우기를 한다. taskq는 맨 위에 고정되고 지우거나 끌 수 없다.

태스크의 시작 버튼은 bot과 상관없는 일회성 실행이다. 지금까지처럼 태스크 종류별 권한과 승인 절차로 한 번 돌고 끝난다. bot이 맡은 태스크도 시작 버튼으로 한 번 돌릴 수 있고, 그 결과는 맡은 bot에게 전달된다.

bot을 만들 때 고를 수 있는 시작 프리셋은 아래와 같다. 만든 뒤 모두 바꿀 수 있다.

| 프리셋 | 하는 일 |
|---|---|
| planner | 일을 태스크로 나누고 순서(depends_on)와 우선순위를 정해 bot에게 맡긴다 |
| coder | 코드 태스크를 맡아 작업 디렉터리에서 고치고 테스트를 돌린 뒤 결과를 남긴다 |
| reviewer | 변경을 보고 file:line 근거를 붙여 지적한다 |
| doc-reviewer | 문서와 계획에서 근거 없는 주장과 재현되지 않는 절차를 찾는다 |

bot 설정에서 정하는 것은 아래와 같다.

| 설정 | 기본값 | 뜻 |
|---|---|---|
| 권한 모드 | Auto | Claude가 판단하고 위험한 호출은 거절한다. Accept edits, Ask(승인이 필요한 호출은 거절), Plan only, Bypass도 고를 수 있다. bot은 지켜보는 사람이 없으므로 승인을 기다리지 않고 거절한다 |
| 샌드박스 | 끔 | 켜면 명령이 샌드박스에서 돌고, 쓰기는 작업 디렉터리로, 네트워크는 허용 호스트로 제한된다 |
| 차단 명령 | 없음 | 줄마다 패턴 하나. `*`만 와일드카드다. `git push*`를 넣으면 `cd app && git push`도 막힌다. 변수나 스크립트 파일로 우회할 수 있으니 꼭 막아야 할 것은 샌드박스로 막는다 |
| 작업 디렉터리 | bot 폴더 | bot이 일하는 곳. 저장소에서 일할 bot은 저장소 경로를 넣는다 |
| skill, plugin | 없음 | 설정에 등록된 것 중에서 고른다 |

설정과 관계없이 모든 bot은 taskq의 데이터와 설정 파일을 건드릴 수 없다. 건드리려 하면 그 turn이 멈추고 bot 전체가 멈추며 보안 알림이 뜬다.

bot은 계속 떠 있는 프로세스가 아니다. 메시지가 올 때마다 그 bot의 세션을 이어서 한 번 일하고 멈춘다. 그래서 taskq를 다시 시작해도 대화가 이어지고, 메시지가 없으면 비용이 들지 않는다. 메시지 없이 스스로 깨어나지는 않는다. 나중에 할 일은 bot이 시각을 정한 메시지(`deliver_at`)로 예약하고, 그 시각에 깨어난다. 자기 자신에게는 10분 이상 뒤로만 예약할 수 있다.

작업 하나는 bot 하나가 맡는다(owner). 맡은 bot만 그 태스크를 시작할 수 있고, 시작하면 Board에서 실행 중으로 바뀌고 Calendar에 그 bot의 실행으로 남는다. 계정을 건드리는 초안은 내가 Queued로 바꿔야 bot이 시작할 수 있다. Board 카드의 `@coder` 같은 배지와 bot 대화 위의 작업 칩이 누가 무엇을 맡았는지 보여준다. 작업 상세의 Owner에서 다른 bot에게 넘기거나 되찾는다. taskq나 planner 역할 bot이 내 작업을 가져가면 Must check에 알림이 뜬다. bot이 열려 있는 작업과 비슷한 작업을 만들려 하면 거절되고 그 작업의 owner와 이야기하라는 답을 받는다. 이 비슷함 검사는 글자 겹침으로만 판단해서 표현이 다르면 놓치고, 비슷한 문장의 다른 작업을 잘못 막기도 한다.

여러 bot의 의견이 필요한 질문은 토론으로 한다. 토론을 연 bot이 참가자와 라운드 수를 정하고, 참가자는 순서대로 앞사람의 말을 보고 의견을 낸다. 라운드가 끝나면 연 bot이 결론을 wiki에 남기고 필요한 작업을 맡긴다. 결론을 내지 않으면 토론은 결론 없이 닫히고 알림이 뜬다. Discussions 화면이나 `taskq bots close`로 직접 닫을 수도 있다.

agent는 파일을 읽기만 한다. 코드 수정, 명령 실행, 웹 조회는 태스크로 만들어 지금과 같은 샌드박스와 승인 절차를 지난다. agent가 만든 계정 조회·변경 태스크는 항상 초안으로 들어가므로, Board에서 내가 보고 Queued로 바꿔야 실행된다.

bot을 쓰려면 설정 파일에 `bots`를 넣고 다시 시작한다.

```json
"bots": {
  "enabled": true,
  "dailyBudgetUsd": 10,
  "readRoots": ["/Users/me/work"]
}
```

| 키 | 기본값 | 뜻 |
|---|---|---|
| `enabled` | false | 팀을 켠다 |
| `dailyBudgetUsd` | 10 | 자정 이후 bot 턴 비용과, bot이 맡은 뒤 실행된 태스크 비용을 합한 상한. 넘으면 bot이 멈춘다. 이미 큐에 들어간 태스크는 큐를 멈춰야 멈춘다 |
| `hourlyTurnsPerAgent` | 20 | bot 하나가 1시간에 할 수 있는 턴 수. bot끼리 메시지를 주고받는 루프를 막는다. 넘으면 bot이 멈춘다 |
| `turnMaxTurns`, `turnBudgetUsd` | 30, 1 | bot 턴 한 번의 모델 턴 수와 비용 상한 |
| `maxOpenTasks` | 10 | bot이 맡은 태스크 중 대기, 실행, 승인 대기, 로그인 대기 상태인 것의 최대 개수. 초안과 리뷰 대기는 세지 않는다 |
| `maxConcurrentTurns` | 2 | 동시에 일하는 bot 수 |
| `maxAttempts` | 3 | 같은 메시지로 실패한 턴이 이 횟수가 되면 그 메시지를 내려놓고 알림을 띄운다 |
| `readRoots` | [] | bot이 만드는 code 태스크의 저장소로 쓸 수 있는 디렉터리. 시작 버튼으로 돌 때의 권한 경계다 |
| `personaSkill` | 없음 | 나 대신 판단할 기준을 담은 skill 폴더의 절대 경로. taskq는 내 결정이 아닌 선택을 할 때, reviewer와 doc-reviewer는 리뷰할 때 읽는다. 승인을 대신하지 않는다 |

일을 맡기고 결과를 받는 명령은 아래와 같다. 화면에서는 왼쪽 메뉴의 taskq를 눌러 같은 일을 한다.

```bash
taskq bots say "README의 설치 절차를 실제로 따라 해 보고 틀린 곳을 고쳐줘. 저장소는 /Users/me/work/app"
taskq bots inbox
taskq bots log
taskq bots wiki
```

taskq가 나에게 보낸 메시지는 Must check에도 "Message from a bot"으로 뜨고, 메뉴의 taskq 옆에 파란 점이 붙는다. CLI로 보낸 메시지는 실행 중인 taskq가 `pollSec`(기본 60초) 안에 가져가고, 화면에서 보낸 메시지는 바로 전달된다.

bot이 공유하는 기억은 wiki다. bot은 일을 시작하기 전에 wiki를 찾고, 결정과 출처가 있는 사실, 진행 상태를 적는다. 세션을 새로 시작해도(`taskq bots reset NAME`) wiki는 남는다.

wiki 검색은 단어의 일부로도 찾는다. "검색률"로 "검색률이"가 들어간 페이지를 찾고, 맞은 페이지가 `[[slug]]`로 가리키는 페이지도 함께 보여준다. 같은 뜻의 다른 단어는 찾지 못한다. 페이지는 `TASKQ_HOME/wiki/` 아래 markdown 파일로도 저장되므로, graphify 같은 도구로 이 폴더의 지식 그래프를 만들 수 있다. 결과가 `wiki/graphify-out/GRAPH_REPORT.md`에 있으면 bot이 읽는다. 이 파일들은 사본이라 고쳐도 wiki에 반영되지 않는다.

```bash
taskq bots search 검색률
taskq bots export
```

글로벌 설정(헤더의 Settings)에서 정하는 것은 아래와 같다.

- Appearance: 글꼴과 글자 크기. 바꾸는 즉시 앱 전체에 적용된다.
- Queue: 맡은 bot이 없는 태스크를 큐가 스스로 실행할지. 끄면 시작 버튼을 눌러야만 실행된다.
- Skills for bots, Plugins for bots: bot이 쓸 skill 폴더와 plugin 폴더를 등록한다. 각 bot은 자기 설정에서 고른다. bot은 고른 것을 복사해 두고 쓰므로, skill 파일을 고친 뒤에는 bot의 오른쪽 버튼 메뉴에서 Reload skills를 눌러야 반영된다.

bot은 내 Claude Code 설정(~/.claude의 권한 규칙, hook, skill)을 읽지 않는다. bot 설정 화면에 보이는 것만으로 동작한다.

멈춘 bot을 Resume하면 예산과 턴 수 계산이 그 시점부터 다시 시작된다. 상한에 걸린 원인을 확인하고 켠다. 메시지를 보내거나 작업을 만든 뒤 실패한 턴은 같은 일을 반복하지 않도록 다시 돌리지 않는다. 이때 Must check에 어떤 메시지를 내려놓았는지 뜨므로, 필요하면 다시 보낸다.

## 11. 처음 쓸 때 직접 확인할 것

아래는 실제 모델 세션 없이 검증했기 때문에, 내 기기에서 한 번씩 확인한다.

- 조회 태스크의 AWS 명령이 샌드박스 안에서 엔드포인트에 닿는지. 안 닿으면 `sandbox.allowedDomains`에 호스트를 추가한다.
- `auto` 권한 모드를 내 계정과 모델에서 쓸 수 있는지. 안 되면 `autoMode`를 false로 둔다.
- 변경 태스크가 변경 명령 앞에서 승인을 묻는지. 내 Claude 설정에 allow 규칙이 있어도 묻는지 본다.
- bot을 켰다면 `taskq bots say "hello"` 뒤 `taskq bots turns`에 턴이 done으로 남는지, `taskq bots inbox`에 taskq의 답이 오는지. 세션 이어받기, bot 도구 호출, 읽기 경로 제한은 가짜 SDK로만 시험했다.

## 12. 자주 겪는 문제

| 증상 | 원인과 해결 |
|---|---|
| 화면에 "Open the URL that taskq run printed"가 뜬다 | 토큰이 없거나 서버가 다시 시작됐다. 터미널에 출력된 주소로 다시 연다 |
| Must check에 "Queue paused"가 떠 있다 | 모델 인증 확인에 실패했거나 내가 멈췄다. 이유가 함께 표시된다. 인증을 고치면 스스로 풀리고, 내가 멈춘 것은 Resume queue로 푼다 |
| 태스크가 계속 "Login needed"다 | 대상 계정 로그인이 만료됐다. 터미널에서 로그인한 뒤 Resume |
| 조회 태스크에서 명령이 거부된다 | 조회 전용 규칙에 없는 명령이다. 변경이 필요하면 Task의 기본 모드(Change an account)로 만든다 |
| 태스크가 "Interrupted"로 남는다 | 실행 중에 프로세스가 죽었다. 다음 실행에서 이전 세션을 이어받는다 |
| Must check에 "Bots paused"가 떠 있다 | 일일 예산을 다 썼거나, bot 하나가 1시간 턴 상한을 넘었거나(메시지 루프 의심), 모델 로그인이 실패했거나, bot이 taskq 데이터를 읽으려 했다. `taskq bots log`로 원인을 보고 `taskq bots resume`이나 메뉴 Bots 옆의 Resume으로 다시 켠다 |
| 고친 화면이 안 보인다 | 브라우저를 새로 고친다 |
| 회사 네트워크에서 `certificate verify failed`나 `self-signed certificate in certificate chain`이 뜬다 | TLS 검사 장비가 인증서를 자기 CA로 다시 서명한다. 그 CA를 넣은 PEM 파일을 `caBundle`에 적고 다시 시작한다 |

구독 로그인은 내 기기에서 내가 쓰는 용도다. 이 도구를 다른 사람에게 제공하는 제품으로 만들 때는 `api_key`나 `bedrock`을 쓴다.
