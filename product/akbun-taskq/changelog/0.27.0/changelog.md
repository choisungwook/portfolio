# akbun-taskq 0.27.0

## Added

- 설정 > 연결을 Claude, OpenAI, Kiro 절로 나눴다. 절마다 인증 방식을 고르고 그 방식에 필요한 값(API key, AWS 프로파일과 region, SSO start URL과 region)만 채운 뒤 연결 테스트, 저장, 지우기를 누른다. 연결 테스트는 5초 안에 답이 없으면 실패로 보고, 성공은 초록 체크, 실패는 빨간 X와 이유로 보인다. 저장하면 연결 테스트를 바로 실행한다. 지우기는 저장한 값과 key를 지워 taskq.config.json과 환경 변수로 돌아간다.
- OpenAI API key를 설정에 저장할 수 있다(`TASKQ_HOME/data/openai-api-key`, 0600). 저장한 key가 `OPENAI_API_KEY`보다 우선한다.
- Claude bot도 bot마다 인증 방식(SDK API key, 구독, AWS Bedrock)을 고른다. 고르지 않은 기존 bot은 설정 > 연결에서 고른 방식을 따른다.
- `POST /api/connections/test`, `DELETE /api/connection-settings/:runtime`.
- Plugins에 Kiro 탭을 더했다.

## Changed

- bot 만들기에서 Name 아래에 Agent type(Claude, OpenAI, Kiro)과 인증 방식(SDK, 구독, AWS Bedrock; Kiro는 AWS IAM Identity Center)을 한 줄씩 둔다.
- Plugins에 등록한 skill, plugin, MCP server는 모든 bot이 타입에 맞게 함께 쓴다(plugin은 Claude bot만). bot 설정의 고르기 칸을 없앴고, 등록·삭제·설치·업데이트하면 해당 bot을 모두 다시 불러온다.
- 오른쪽 화면 바탕을 왼쪽 메뉴와 같은 색으로 바꾸고, 그 바탕과 같은 색이던 보드 열, 위키 목록과 본문, 검색 결과는 회색 타일로 바꿨다.
- 제목 위계를 메뉴 이름(H1), 절(H2, 위 여백과 아래 구분선), 소절(H3)로 맞췄다. 설정 페이지, Plugins, 위키, 공용 폴더, 워크플로, bot 설정에 적용했다.

## Removed

- routine(cron 일정과 작업 실패·새 작업·webhook 트리거로 bot에게 일을 보내는 기능)을 없앴다. bot 설정의 Routines 칸, `/api/routines` API, `schedule_routine`·`list_routines`·`cancel_routine` 도구, 주간 점검의 routine 표가 함께 빠졌고 migration 011이 `bot_routines` 표를 지운다.
- 설정 > 연결의 연결 카드 목록과 "다시 확인" 버튼.

## SDK

변경 없음.
