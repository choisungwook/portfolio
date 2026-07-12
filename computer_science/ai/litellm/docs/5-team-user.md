# team과 user로 권한을 계층으로 나눈다

[4-auth-rate-limit.md](4-auth-rate-limit.md)에서는 key 하나에 권한과 한도를 박았다. 그런데 회사에는 사람이 수십 명, 팀이 여럿이다. 사람마다 key를 만들고 한도를 따로 관리하면 금세 무너진다. LiteLLM은 team과 user 계층으로 예산·권한을 상속시켜 이 규모 문제를 푼다. 이 문서는 team을 만들고 user를 붙인 뒤, 예산이 어느 층에서 걸리는지 직접 확인한다. 실습 환경은 [2-setup.md](2-setup.md)에서 먼저 띄워 둔다.

## key 하나로는 왜 부족한가

key 단위 제한은 애플리케이션 하나를 다룰 때는 충분하다. 문제는 조직이다. 플랫폼팀이 이번 달에 쓸 총예산을 5달러로 묶고 싶다고 하자. key마다 예산을 나눠 걸면, key를 하나 더 발급하는 순간 팀 총합이 깨진다. 반대로 "이 사람이 이번 달에 얼마 썼나"를 보려면 사람을 식별하는 층이 필요하다. key만으로는 이 두 질문에 답할 수 없다.

그래서 LiteLLM은 team(공통 예산을 공유하는 묶음)과 user(사람을 식별하는 주체)를 key 위에 둔다. key는 team에 소속될 수 있고, 소속되면 팀 예산을 함께 쓴다. 조직도가 그대로 예산 구조가 되는 셈이다.

## team을 만든다

`/team/new`에 master key로 요청한다. 팀이 쓸 모델, 팀 전체 월 예산, 분당 요청 수를 함께 정의한다.

```bash
curl -s http://localhost:4000/team/new \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "team_alias": "platform",
    "models": ["gpt", "gemini"],
    "max_budget": 5,
    "budget_duration": "30d",
    "rpm_limit": 100
  }'
```

응답의 `team_id`가 이 팀을 가리키는 식별자다. 다음 단계에서 계속 쓰니 저장해 둔다.

```bash
TEAM_ID=...   # 위 응답의 team_id
```

## user를 만들고 team에 넣는다

user는 사람을 식별하는 주체다. `/user/new`로 만들고, 개인 예산도 함께 걸 수 있다.

```bash
curl -s http://localhost:4000/user/new \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "dev-a",
    "models": ["gemini"],
    "max_budget": 1,
    "budget_duration": "30d"
  }'
```

만든 user를 팀에 넣는다. `max_budget_in_team`으로 "팀 예산 안에서 이 사람이 쓸 수 있는 몫"을 따로 제한할 수 있다. 팀 전체 5달러 중 이 사람은 0.5달러까지만.

```bash
curl -s http://localhost:4000/team/member_add \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "team_id": "'"$TEAM_ID"'",
    "member": {"role": "user", "user_id": "dev-a"},
    "max_budget_in_team": 0.5
  }'
```

이제 조직은 team(공통 예산) 아래 user(개인 몫)가 붙은 2단 구조가 됐다.

## 예산은 어느 층에서 걸리나

핵심은 상속과 우선순위다. key를 발급할 때 `team_id`를 붙이면, 그 key의 사용액은 개인이 아니라 팀 예산에서 차감된다.

```bash
curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"team_id": "'"$TEAM_ID"'", "key_alias": "platform-app"}'
```

이 key로 호출하면 사용액이 `platform` 팀의 5달러에서 빠진다. 같은 팀으로 발급한 다른 key도 같은 5달러를 나눠 쓴다. key를 몇 개 더 만들어도 팀 총합은 그대로 5달러로 묶인다 — key 단위로는 불가능하던 통제다.

한도가 여러 층에 겹쳐 걸리면 우선순위는 이렇다.

| 우선순위 | 걸리는 층 | 적용 조건 |
|---|---|---|
| 1 (가장 먼저) | key 자체의 한도 | key에 `max_budget`·`rpm_limit`이 있으면 |
| 2 | team 한도 | key에 `team_id`가 있으면 개인 예산 대신 팀 예산 |
| 3 | user 한도 | 팀에 속하지 않은 개인 key |

즉 팀에 속한 key는 개인 예산을 보지 않고 팀 예산을 본다. 조직 예산을 팀 단위로 관리하려면 key를 반드시 team에 소속시켜 발급하는 게 요령이다.

## OSS와 enterprise 경계

여기까지 쓴 team·user·예산 상속·rate limit은 전부 LiteLLM OSS 기능이다. Postgres만 있으면 된다. 그 위 계층인 organization(팀들을 다시 묶는 상위 조직), key별 모델 단위 예산(`model_max_budget`), 예산 tier, SSO 로그인, 변경 이력을 남기는 audit log는 enterprise tier다. OSS에서는 organization 없이 team부터 시작하면 조직 대부분의 요구가 커버된다. 이 실습도 그 선을 지켜 team·user까지만 다뤘다.

## 다음

권한 구조까지 만들었으니, 이제 누가 얼마 썼는지 남기고 위험한 요청을 걸러낼 차례다. [6-audit-guardrails.md](6-audit-guardrails.md)로 넘어간다.
