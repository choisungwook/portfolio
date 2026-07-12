# virtual key를 3계층으로 쌓는 Bifrost의 거버넌스

LiteLLM에서 virtual key로 인증·인가·한도를 걸어 봤다. Bifrost는 virtual key를 거버넌스의 1급 개념으로 놓고, customer → team → virtual key 3계층으로 예산과 한도를 쌓는다. 이 문서는 config.json의 governance 블록으로 virtual key 하나에 모델 허용 목록, 예산, rate limit을 걸고, 잘못된 key가 provider에 닿기 전에 막히는 것을 확인한다. 실습 환경은 [2-setup.md](2-setup.md)에서 띄운 gateway를 쓴다.

## governance 블록의 뼈대

[docker/config.json](../docker/config.json)의 providers 옆에 governance 블록을 더한다. virtual key, 예산, rate limit을 각각 정의하고 id로 연결하는 구조다. 아래는 실제로 부팅되는 최소 구성이다.

```json
{
  "governance": {
    "virtual_keys": [
      {
        "id": "vk-team-a",
        "name": "team-a-key",
        "value": "sk-bf-team-a-demo",
        "is_active": true,
        "rate_limit_id": "rl-team-a",
        "provider_configs": [
          { "provider": "gemini", "allowed_models": ["gemini-2.0-flash"], "key_ids": ["*"], "weight": 1 }
        ]
      }
    ],
    "budgets": [
      { "id": "budget-team-a", "max_limit": 5.0, "reset_duration": "1M", "virtual_key_id": "vk-team-a" }
    ],
    "rate_limits": [
      { "id": "rl-team-a", "request_max_limit": 2, "request_reset_duration": "1m",
        "token_max_limit": 100000, "token_reset_duration": "1m" }
    ]
  }
}
```

각 조각이 하는 일은 이렇다.

- `provider_configs.allowed_models` — 이 key로 쓸 수 있는 모델 목록. 인가(authz)에 해당한다.
- `budgets.max_limit` + `reset_duration` — 기간별 예산. `1M`은 한 달, `1d`·`1h`·`1w`·`1Y`도 된다. 누적액이 넘으면 막는다.
- `rate_limits` — 요청 수(`request_max_limit`)와 토큰 수(`token_max_limit`)를 각각 기간 단위로 제한한다. LiteLLM의 RPM에 더해 토큰 단위까지 나뉜다.

governance 블록을 더한 뒤에는 [2-setup.md](2-setup.md)의 기동 명령으로 컨테이너를 다시 띄워야 로드된다.

## 부팅에서 실제로 막히는 지점 두 가지

이 구성을 만들 때 실측으로 걸린 함정이 둘 있다. 문서로만 보면 놓치기 쉽다.

첫째, virtual key의 `value`는 `sk-bf-` 접두사가 있어야 한다. 없으면 Bifrost가 "이 값은 규격이 아니다"라며 새 key를 생성해 버려서, 내가 정한 값으로 클라이언트가 인증할 수 없게 된다. 그래서 예시의 값도 `sk-bf-`로 시작한다.

둘째, 예산·rate limit은 virtual key를 참조(`virtual_key_id`, `rate_limit_id`)하므로 virtual key가 먼저 성공적으로 만들어져야 한다. virtual key가 어떤 이유로 스킵되면(예: `env.` 참조가 컨테이너에 전달되지 않으면) 예산 생성이 FOREIGN KEY 제약으로 실패하고 부팅이 죽는다. `value`를 `env.` 참조로 둘 거라면 그 환경변수를 반드시 컨테이너에 전달해야 한다.

여기서 "그냥 웹 UI로 만들면 안 되나" 싶을 텐데, 맞다. Bifrost는 UI에서 virtual key를 발급·관리할 수 있고 그 편이 쉽다. config.json 방식은 거버넌스 상태를 코드로 관리하는 GitOps를 위한 것이다. 팀 정책을 리뷰·버전관리하려면 파일이 낫고, 빠르게 만들려면 UI가 낫다.

## 잘못된 key는 provider에 닿기 전에 막힌다

거버넌스의 값어치는 여기서 드러난다. 등록한 virtual key를 클라이언트가 헤더로 제시한다. Bifrost는 `x-bf-vk` 헤더와 `Authorization: Bearer` 둘 다 받는다.

```bash
# 정상 key: governance를 통과해 provider로 간다
curl -s http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-bf-vk: sk-bf-team-a-demo" \
  -d '{"model": "gemini/gemini-2.0-flash", "messages": [{"role": "user", "content": "hi"}]}'
```

없는 key를 주면 응답이 다르다. provider까지 가지 않고 gateway가 먼저 끊는다.

```bash
# 잘못된 key: 401 virtual_key_not_found
curl -s http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-bf-vk: sk-bf-wrong" \
  -d '{"model": "gemini/gemini-2.0-flash", "messages": [{"role": "user", "content": "hi"}]}'
```

두 번째 요청은 `401`과 함께 "virtual key not found"를 돌려준다. 인증이 provider 호출 앞단에서 끝나는 것이다. 허용 목록에 없는 모델을 부르거나, 예산·rate limit을 넘겨도 같은 원리로 provider 비용이 발생하기 전에 gateway에서 차단된다. LiteLLM track에서 말한 "통제를 트래픽 경로에 둔다"가 Bifrost에서도 그대로 성립한다.

## 다음

이제 이 gateway를 인터넷이 없는 폐쇄망에 올린다. LiteLLM track에서 만든 폐쇄망 인프라를 거의 그대로 재사용하고 gateway만 Bifrost로 바꾼다. [5-airgapped-bedrock.md](5-airgapped-bedrock.md)로 넘어간다.
