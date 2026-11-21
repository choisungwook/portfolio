# akbun-taskq 0.11.0

bot이 대답하지 않을 때 이유를 화면에서 찾을 수 있게 한다. 처음 읽는 agent는 `wiki/architecture.md`의 Connections 절을 먼저 읽는다.

## Added

- 설정의 연결(Connections) 페이지: bot이 모델에 닿는 방법마다 카드 하나(Claude provider, OpenAI API 키, OpenAI Bedrock, ChatGPT 구독, Kiro). 상태(연결됨/실패), 무엇을 쓰는지(region, AWS 프로파일, 환경 변수, CLI), 실패 이유, 쓰는 bot, 마지막 응답과 실패한 마지막 turn을 보인다. bot이 꺼져 있거나(`bots.enabled`) 일시정지면 맨 위에 경고를 띄운다. Kiro 로그인도 이 페이지로 옮겼다.
- bot 대화 오른쪽의 연결 패널: 그 bot이 쓰는 연결과 상태, 대답하지 않는 가장 그럴듯한 이유(bot 꺼짐 설정, 일시정지, bot 꺼짐, 연결 실패, 마지막 turn 실패 순. 일하는 중이면 없고, 취소·중단된 turn은 실패로 보지 않음), 기다리는 메시지 수, 다시 확인과 연결 설정 바로 가기.
- bot 대화 안의 오류: 실패한 turn은 그 자리에 "turn 실패: <이유>"로, 서버가 거부한 내 메시지는 "보내지 못함: <오류>"로(입력은 남음), 보냈지만 bot이 지금 대답할 수 없으면 맨 아래에 "아직 대답할 수 없음: <이유>"로 보인다. 전에는 보내기 오류가 잠깐 뜨는 알림뿐이었고 실패한 turn은 대화에 보이지 않았다.
- `GET /connections`, `GET /bots/:name/connection`, `GET /bots/:name/turn-errors`와 operation `connections`, `bot_connection`, `bot_turn_errors`(CLI·MCP).

## Changed

- 설정 dialog를 한 페이지에서 왼쪽 메뉴와 오른쪽 페이지로 바꿨다. 마지막으로 연 페이지를 기억한다.

## SDK

SDK 사용 변경 없음. 연결 검사는 기존 Claude preflight(`aws sts get-caller-identity`), `codex login status`, `kiro-cli whoami`, 환경 변수 확인을 쓴다.

## Not verified with a real model

- 실제 Bedrock 프로파일, Codex, Kiro 로그인으로 검사를 돌려 보지 않았다. `codex login status`가 로그인 안 된 상태에서 0이 아닌 코드나 "Not logged in"을 내는 것을 가정했다.
