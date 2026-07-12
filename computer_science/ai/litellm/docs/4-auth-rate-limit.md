# virtual key 하나로 인증·인가·한도를 동시에 건다

master key를 애플리케이션에 나눠주면 안 된다. 그건 모든 걸 할 수 있는 관리자 열쇠다. 대신 gateway로 팀·용도별 virtual key를 발급하고, 그 key마다 "어떤 모델을 얼마나 쓸 수 있는지"를 박아 넣는다. 이 문서는 key 발급, 모델 접근 제한, RPM·예산 한도를 차례로 건다. 실습 환경은 [2-setup.md](2-setup.md)에서 먼저 띄워 둔다.

## master key와 virtual key의 관계

master key는 key를 발급하고 관리하는 단 하나의 열쇠다. virtual key는 그 master key로 찍어내는 하위 열쇠이고, 발급할 때 권한과 한도를 함께 정의한다. 이 구조 덕분에 애플리케이션은 자기 몫의 제한된 key만 쥐고, 유출되면 그 key만 회수하면 된다.

virtual key와 spend 상태는 [2-setup.md](2-setup.md)에서 띄운 Postgres에 저장된다. 그래서 이 실습은 DB가 반드시 필요하다.

## 권한을 박은 key를 발급한다

`/key/generate`에 master key로 요청한다. 아래 key는 `gemini`만 쓸 수 있다. `gpt`로 부르면 거부된다.

```bash
curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"models": ["gemini"], "key_alias": "team-a"}'
```

응답의 `key` 값(`sk-...`)이 발급된 virtual key다. 이 key로 허용되지 않은 `gpt`를 부르면 어떻게 되는지 확인한다.

```bash
VKEY=sk-...   # 위에서 받은 key
curl -s http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $VKEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt", "messages": [{"role": "user", "content": "hi"}]}'
```

권한 밖 모델이라 거부된다. 인증(누구인가)과 인가(무엇을 할 수 있나)가 key 하나에 함께 걸린 것이다. 여기서 "그럼 사람마다 key를 다 만드나" 싶을 텐데, LiteLLM은 team과 user 단위로 묶어 예산과 모델을 상속시키는 구조를 준다. 그 계층은 [5-team-user.md](5-team-user.md)에서 직접 만든다.

## 토큰 폭주를 막는다: RPM과 예산

회사가 gateway를 원하는 큰 이유 하나가 비용 통제다. key를 발급할 때 분당 요청 수(RPM)나 예산(max_budget)을 걸 수 있다. 한도를 넘으면 gateway가 provider에 닿기 전에 막는다.

분당 2건으로 제한한 key를 만든다.

```bash
curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"models": ["gemini"], "rpm_limit": 2, "key_alias": "rate-test"}'
```

이 key로 짧은 시간에 세 번 이상 요청하면 세 번째부터 `429 Too Many Requests`가 돌아온다. provider 비용이 발생하기 전에 gateway에서 끊기는 것이 핵심이다. 같은 방식으로 `max_budget`(달러)을 걸면, 누적 사용액이 한도를 넘는 순간 그 key는 거부된다.

```bash
# 예산을 아주 작게 걸어 소진을 관찰한다
curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"models": ["gemini"], "max_budget": 0.01, "key_alias": "budget-test"}'
```

## 왜 애플리케이션이 아니라 gateway에서 거나

한도를 애플리케이션 코드에 넣을 수도 있다. 하지만 그러면 팀마다, 언어마다 제각각 구현하고, 우회도 쉽다. gateway는 모든 LLM 트래픽이 지나는 단일 지점이라, 여기서 한 번 걸면 애플리케이션이 무엇으로 짜였든 예외가 없다. 통제를 트래픽 경로에 두는 것과 애플리케이션에 맡기는 것의 차이가 여기서 갈린다.

## 다음

key 하나에 권한과 한도를 거는 법을 익혔다. 이걸 사람·팀 규모로 넓혀 예산을 계층으로 상속시키는 [5-team-user.md](5-team-user.md)로 넘어간다.
