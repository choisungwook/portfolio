# 로컬 실습 환경 준비: Bifrost 단일 컨테이너

이 문서는 Bifrost 로컬 환경을 띄운다. 이후 라우팅·거버넌스 문서는 여기서 띄운 gateway를 전제로 한다. LiteLLM track과 가장 크게 다른 점은 DB 컨테이너가 없다는 것이다. Bifrost는 Go 단일 바이너리에 SQLite를 내장해, 컨테이너 하나로 웹 UI와 OpenAI 호환 API가 함께 뜬다.

## 무엇이 뜨는가

[docker/docker-compose.yaml](../docker/docker-compose.yaml)가 컨테이너 하나를 띄운다.

- bifrost: gateway. 포트 8080. [docker/config.json](../docker/config.json)을 마운트하고 `.env`에서 key를 주입받는다. 설정·거버넌스 상태는 내장 SQLite에 저장돼 별도 DB가 필요 없다.

## 사전 준비

- docker와 docker compose가 설치돼 있어야 한다.
- provider API key(OpenAI, Google Gemini)가 있어야 실제 호출이 된다. 없어도 gateway 기동과 provider 로드는 확인할 수 있다.

## key 주입

`.env`를 만들고 값을 채운다. `.env`는 커밋하지 않는다([docker/.gitignore](../docker/.gitignore)가 막는다).

```bash
cd docker
cp .env.example .env
```

채울 값은 다음과 같다.

| 변수 | 용도 |
|---|---|
| `OPENAI_API_KEY` | GPT 호출용 provider key. config.json이 `env.OPENAI_API_KEY`로 참조 |
| `GEMINI_API_KEY` | Gemini 호출용 provider key |
| `BIFROST_ENCRYPTION_KEY` | 설정 스토어(SQLite)에 저장되는 key를 암호화하는 값. 한 번 정하면 바꾸지 않는다 |

## 기동과 확인

```bash
docker compose up -d
```

브라우저로 `http://localhost:8080`에 들어가면 웹 UI 대시보드가 보인다. provider·virtual key·사용량을 눈으로 관리할 수 있는 것이 Bifrost의 특징이다. 등록된 provider와 모델은 아래로 확인한다.

```bash
curl -s http://localhost:8080/v1/models
```

config.json에 적은 provider가 로드되면 목록에 나온다.

## 정리

실습이 끝나면 컨테이너와 데이터 볼륨까지 내린다.

```bash
docker compose down -v
```

## 다음

환경이 떴으면 이 gateway로 GPT·Gemini를 부르는 [3-routing.md](3-routing.md)로 넘어간다.
