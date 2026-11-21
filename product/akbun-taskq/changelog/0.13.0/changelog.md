# akbun-taskq 0.13.0

Claude와 OpenAI bot이 이 컴퓨터의 AWS 프로파일(SSO 포함)로 Bedrock에 로그인하게 하고, 설정 화면에서 고르게 한다.

## Added

- 설정 > 연결의 "bot 로그인 방식": Claude의 provider(Bedrock, Anthropic API 키, Claude 구독), AWS 프로파일, region과 OpenAI on Bedrock의 AWS 프로파일, region. 프로파일 칸은 `~/.aws`의 프로파일을 제안한다. 저장하면 taskq.config.json보다 우선하고 다음 turn부터 적용된다. CLI·MCP(`taskq api connection_settings_set`)로 바꾸면 실행 중인 서버가 `pollSec` 안에 반영한다.
- OpenAI on Bedrock bot의 AWS 프로파일 로그인(`bots.bedrockProfile`): 프로파일의 단기 자격증명으로 Bedrock 토큰을 만들어 쓴다. 자격증명을 얻지 못하면 프로파일 종류에 맞는 고정 안내(SSO면 "aws sso login --profile …")가 대화와 연결 페이지에 뜨고(AWS SDK의 오류 문구는 `credential_process` 명령줄을 담을 수 있어 쓰지 않는다), bot은 꺼지지 않아 로그인하면 다시 동작한다. 프로파일을 비우면 전처럼 `AWS_BEARER_TOKEN_BEDROCK`을 쓴다.
- `GET/PUT /connection-settings`, `GET /aws/profiles`와 operation `connection_settings`, `connection_settings_set`, `aws_profiles`.

## SDK

`@aws/bedrock-token-generator` 1.1.0(새 의존성): `getTokenProvider({ credentials: fromIni({ profile }), region })`로 Bedrock OpenAI 호환 endpoint에 보낼 단기 bearer 토큰을 만든다. 토큰 수명은 12시간과 자격증명 수명 중 짧은 쪽이고, taskq는 10분 동안 재사용한다.

`@aws-sdk/credential-providers`(새 의존성): `fromIni({ profile })`가 SSO, assume role, credential_process, 정적 키 프로파일의 자격증명을 푼다. SSO는 `aws sso login`이 남긴 캐시를 쓴다.

`@openai/agents-openai`: `OpenAIProvider({ apiKey: <위 토큰>, baseURL: bedrock-runtime…/openai/v1 })`로 이전과 같다.

## Not verified with a real model

- 실제 SSO 프로파일로 Bedrock 호출을 해 보지 않았다. 토큰 생성은 가짜 자격증명으로 오프라인에서 형식(`bedrock-api-key-…`)만 확인했다.
