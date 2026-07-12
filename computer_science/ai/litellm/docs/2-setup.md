# 로컬 실습 환경 준비: LiteLLM proxy와 Postgres

이 문서는 Track A의 로컬 환경을 띄운다. 이후 라우팅·인증·감사 문서는 모두 여기서 띄운 gateway를 전제로 하므로, 먼저 이 문서대로 환경을 올려 둔다. 구성은 gateway proxy 하나와 상태 저장용 Postgres 하나다.

## 무엇이 뜨는가

[set-model/docker-compose.yaml](../install/set-model/docker-compose.yaml)가 두 컨테이너를 띄운다.

- litellm: gateway proxy. 포트 4000. [set-model/config.yaml](../install/set-model/config.yaml)을 마운트하고 `.env`에서 key를 주입받는다.
- db: Postgres 16. virtual key·spend log 등 gateway 상태를 저장한다. virtual key와 사용량 추적에 DB가 필요해 한 쌍으로 띄운다.

compose 파일의 각 줄(이미지 태그·config mount·env 주입·DB 연결)이 무엇을 하는지는 [manual/docker-compose.md](../install/manual/docker-compose.md)에 정리돼 있다.

## 사전 준비

- docker와 docker compose가 설치돼 있어야 한다.
- provider API key(OpenAI, Google Gemini)가 있어야 실제 호출이 된다. 없어도 gateway 기동과 virtual key 발급은 확인할 수 있다.

## key 주입

`.env`를 만들고 값을 채운다.

```bash
cd install/set-model
cp .env.example .env
```

채울 값은 다음과 같다.

| 변수 | 용도 |
|---|---|
| `OPENAI_API_KEY` | GPT 호출용 provider key |
| `GEMINI_API_KEY` | Gemini 호출용 provider key |
| `LITELLM_MASTER_KEY` | gateway 관리자 key. virtual key 발급에 쓴다. `sk-`로 시작 |
| `LITELLM_SALT_KEY` | DB에 저장하는 key를 암호화하는 salt. 한 번 정하면 바꾸지 않는다 |
| `POSTGRES_PASSWORD` | Postgres 비밀번호 |
| `UI_USERNAME` | 관리 콘솔(`/ui`) 로그인 계정. [7-web-ui.md](7-web-ui.md)에서 쓴다 |
| `UI_PASSWORD` | 관리 콘솔 로그인 비밀번호 |

## 기동과 확인

```bash
docker compose up -d
```

gateway가 살아났는지 확인한다. LiteLLM은 상태 확인용 endpoint를 준다.

```bash
curl -s http://localhost:4000/health/liveliness
```

`"I'm alive!"`가 나오면 정상이다. 등록된 모델 별칭은 아래로 확인한다. `gpt`, `gemini`가 보이면 config.yaml이 제대로 로드된 것이다.

```bash
curl -s http://localhost:4000/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```

## UI 접속

관리 콘솔은 `/ui` 경로에 있다. 로그인 계정은 `.env`의 `UI_USERNAME`·`UI_PASSWORD`다.

```text
http://localhost:4000/ui
```

콘솔로 key·team·스펜드를 관리하는 실습은 [7-web-ui.md](7-web-ui.md)에서 한다.

## 정리

실습이 끝나면 컨테이너와 DB 볼륨까지 내린다.

```bash
docker compose down -v
```

## 다음

환경이 떴으면 이 gateway로 GPT·Gemini를 부르는 [3-routing.md](3-routing.md)로 넘어간다.
