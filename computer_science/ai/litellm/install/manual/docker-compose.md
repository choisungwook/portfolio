# docker-compose.yaml과 .env로 gateway를 직접 구성한다

gateway는 컨테이너 두 개(proxy·Postgres)로 돈다.

## 두 서비스

```yaml
services:
  litellm:                     # gateway proxy
    image: ghcr.io/berriai/litellm:v1.91.1
    ports:
      - "4000:4000"
  db:                          # 상태 저장소
    image: postgres:16
```

## 환경변수 주입

민감한 값은 config.yaml에 쓰지 않고 환경변수로 넣는다. compose의 `${VAR}`가 같은 디렉터리 `.env`에서 값을 읽어 컨테이너에 전달한다.

```yaml
environment:
  LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY}
  LITELLM_SALT_KEY: ${LITELLM_SALT_KEY}
  DATABASE_URL: postgresql://litellm:${POSTGRES_PASSWORD}@db:5432/litellm
  UI_USERNAME: ${UI_USERNAME}   # 관리 콘솔 로그인 계정
  UI_PASSWORD: ${UI_PASSWORD}
  # 모델을 등록하면 그 모델이 참조하는 provider key를 여기에 추가한다.
  # OPENAI_API_KEY: ${OPENAI_API_KEY}
  # GEMINI_API_KEY: ${GEMINI_API_KEY}
```

각 변수의 쓰임은 이렇다.

| 변수 | 쓰임 |
|---|---|
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | config.yaml의 `os.environ/...`가 참조하는 provider key. 모델을 등록할 때 주석을 풀어 추가한다 |
| `LITELLM_MASTER_KEY` | 관리자 key. key 발급의 뿌리 |
| `LITELLM_SALT_KEY` | DB에 저장하는 key를 암호화하는 salt. 한 번 정하면 바꾸지 않는다 |
| `DATABASE_URL` | proxy가 붙는 Postgres 주소. host는 서비스명 `db` |
| `UI_USERNAME`, `UI_PASSWORD` | 콘솔(`/ui`) 로그인 계정. config가 아니라 env로만 준다([7-web-ui.md](../../docs/7-web-ui.md)) |
