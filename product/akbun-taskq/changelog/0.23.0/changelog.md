# akbun-taskq 0.23.0

## Added

- 설정 > 연결에서 Claude의 로그인 방식을 Anthropic API key로 고르면 API key 입력란이 나온다. 저장한 key는 `TASKQ_HOME/data/anthropic-api-key`에 권한 0600으로 저장되고 환경 변수 `ANTHROPIC_API_KEY`보다 먼저 쓰인다. 입력란을 비워 두고 저장하면 저장된 key를 그대로 둔다.
- `GET /api/connection-settings`가 key 값 대신 저장 여부(`claude_api_key_set`)만 돌려준다. `PUT`은 `claude_api_key`를 받고, `null`이면 저장된 key를 지운다. 화면의 "저장된 key 지우기" 버튼이 이 요청을 보낸다.

## SDK

변경 없음.
