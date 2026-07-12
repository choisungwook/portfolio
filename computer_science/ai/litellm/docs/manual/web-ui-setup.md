# 웹 UI로 gateway를 구성한다: 모델·key·team

빈 gateway를 띄운 뒤 관리 콘솔(/ui)에서 모델과 virtual key, team을 손수 만든다. UI에서 만든 것이 사라지지 않으려면 [manual/config.yaml](../../install/manual/config.yaml)에 `store_model_in_db: true`가 있어야 한다. 이 값이 UI로 추가한 모델을 Postgres에 저장한다.

## 콘솔 로그인

콘솔은 gateway와 같은 포트의 `/ui`에 있다. 로그인 계정은 `.env`의 `UI_USERNAME`·`UI_PASSWORD`다.

```text
http://localhost:4000/ui
```

## 모델 등록

왼쪽 메뉴의 Models(또는 Models + Endpoints)에서 새 모델을 추가한다.

- Public Model Name — 호출자가 부르는 별칭(`model_name`). 예: `gpt`
- LiteLLM Model — `provider/실제모델`. 예: `openai/gpt-4o-mini`
- API Key — provider key를 폼에 직접 붙여 넣는다. gateway가 `LITELLM_SALT_KEY`로 암호화해 DB에 저장하므로 `.env`에 provider key를 둘 필요가 없다

저장하면 목록에 별칭이 나타나고 재기동 없이 즉시 반영된다. 잘 들어갔는지는 모델 목록으로 확인한다. 새 별칭이 보이면 된 것이다.

```bash
curl -s http://localhost:4000/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```

## virtual key 발급

Virtual Keys 화면에서 새 key를 만든다. config.yaml이 아니라 실행 중 gateway에 저장된다.

- Models — 이 key가 부를 수 있는 별칭(방금 등록한 `gpt` 등)
- Team — 소속 팀. 있으면 사용액이 팀 예산에서 차감된다
- Max Budget·RPM Limit — 예산과 분당 요청 상한

생성하면 `sk-`로 시작하는 key가 한 번 표시된다. 이 key로 허용되지 않은 모델을 부르면 거부된다.

## team과 user

Teams에서 팀을, Internal Users에서 사용자를 만든다. 팀에 공통 예산과 모델을 걸고 사용자를 팀에 넣으면 예산이 팀에서 개인으로 상속된다. 어느 층에서 예산이 걸리는지의 원리는 [5-team-user.md](../5-team-user.md)에서 다룬다.

## UI로 다루지 않는 것

라우팅·fallback·guardrail은 콘솔 폼이 아니라 config.yaml에 선언한다. manual/ 트랙에서도 이 부분이 필요하면 config.yaml에 적고 재기동한다. 선언 예시는 [set-model/config.yaml](../../install/set-model/config.yaml)에 있다.

## 다음

모델·key·team을 UI로 만들었으면, 스펜드 대시보드와 요청 로그를 보는 [7-web-ui.md](../7-web-ui.md)로 이어진다. 같은 콘솔의 다른 화면이다.
