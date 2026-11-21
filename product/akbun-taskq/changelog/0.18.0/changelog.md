# akbun-taskq 0.18.0

## Added

- 하루 예산의 80%를 쓰면 사이드바 Bots 머리글의 Running 자리에 "Budget 85%"처럼 쓴 비율이 보인다. 마우스를 올리면 쓴 금액과 한도가 나온다. `GET /api/bots`가 `budget: { spent_usd, limit_usd }`를 돌려준다.

## Changed

- 모델 제공자가 요청 자체를 거부한 turn(HTTP 4xx, 403·408·429 제외: 지원하지 않는 모델 ID나 설정)은 다시 시도하지 않는다. 같은 요청은 같은 답을 받기 때문이다. 메시지는 바로 따로 두고 알림에 이유와 원문 오류를 남긴다. 이전에는 `maxAttempts`번까지 다시 시도했다.

## Fixed

- 거부된 turn이 예산을 깎던 문제. 비용 값 없이 실패한 turn은 turn 예산 전액(기본 $1)을 쓴 것으로 계산하는데, 거부된 요청은 생성된 것이 없는데도 이 계산에 걸려 재시도 몇 번에 하루 예산이 소진된 것으로 처리되고 bot 전체가 멈췄다. 이제 거부된 turn의 비용은 0이다. OpenAI Agents SDK 경로(API key, Bedrock)에 해당한다.

- OpenAI bot on Bedrock: `us.openai.gpt-6.x`처럼 Chat Completions에서 도구와 reasoning을 함께 받지 않는 모델이 `400 Function tools with reasoning_effort are not supported`로 실패하던 문제. 이 오류가 오면 같은 turn을 `reasoning_effort: none`으로 다시 부르고, 그 모델은 다음 turn부터 처음에 `none`으로 부른다. 이런 모델에서는 bot의 effort 설정이 적용되지 않는다.
- 연결 페이지의 Codex 카드: Codex의 `config.toml`에 `model_provider`가 `openai`가 아닌 값(예: `amazon-bedrock`)이면 ChatGPT 로그인이 없어도 오류로 표시하지 않는다. 카드 이름은 "OpenAI · Codex CLI"로 바꿨다.

## SDK

OpenAI Agents SDK: Bedrock에서 `modelSettings.reasoning.effort`에 `none`을 넘길 수 있다. 그 밖의 변경 없음.
