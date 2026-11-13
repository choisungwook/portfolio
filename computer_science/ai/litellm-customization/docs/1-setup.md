# 실습 환경 준비

LiteLLM Proxy를 Docker 없이 로컬 Python 프로세스로 띄운다. 확장 지점(훅, custom provider)을 고칠 때마다 이미지를 다시 빌드하지 않고, 설치된 패키지 소스를 바로 열어 볼 수 있기 때문이다. 답변하는 모델은 모두 `mock_response`로 응답하므로 provider API key와 비용이 필요 없다. 4·5단계의 판정 모델만 로컬 Ollama에서 실제로 돌린다.

## 준비물

| 항목 | 버전 | 비고 |
| --- | --- | --- |
| Python | 3.12 이상 | uv가 자동으로 받는다 |
| uv | 0.11 이상 | 패키지와 가상환경 관리 |
| Docker | Compose v2 | 3단계부터 Postgres |
| Ollama | 0.12.11에서 확인 | 4·5단계 판정 모델 `gemma2:2b`. 로컬에서만 돈다 |
| LiteLLM | 1.109.1 | `pyproject.toml`에 고정. 이유는 [knowledge/decisions/2026-11-litellm-version.md](../knowledge/decisions/2026-11-litellm-version.md) |

## 1. 의존성 설치

workspace 디렉터리에서 `pyproject.toml`에 고정한 버전으로 가상환경을 만든다.

```bash
cd computer_science/ai/litellm-customization
uv sync
```

## 2. master key 준비

Proxy 인증에 쓸 master key는 `.env`에서 읽으므로 `.env.example`을 `.env`로 복사한다. `.env`는 `.gitignore`에 들어 있어 commit되지 않는다.

```bash
cp .env.example .env
```

## 3. Proxy 기동

Proxy는 단계마다 config 파일만 바꿔 4100 port로 띄운다. 아래 명령은 1단계 config로 기동한다.

```bash
uv run --env-file .env litellm --config config/1-basic.yaml --port 4100
```

기동까지는 8~15초가 걸린다. 로그 끝에 `LiteLLM: Proxy initialized with Config, Set models:`와 모델 별칭 목록이 나오면 요청을 받을 준비가 끝난 것이다.

## 4. Postgres 기동 (3단계부터)

3단계부터는 spend log를 Postgres에 저장한다. 1·2단계만 할 때는 건너뛴다. 아래 명령은 컨테이너를 띄우고 준비될 때까지 기다린다.

```bash
docker compose up -d --wait
```

`.env`에서 `DATABASE_URL` 줄의 주석을 푼다. Proxy가 DB를 쓰려면 Prisma client가 있어야 하므로, 아래 명령으로 LiteLLM 패키지에 들어 있는 schema에서 client를 한 번 생성한다. 처음 실행할 때는 Prisma가 node와 query engine을 내려받는다.

```bash
uv run prisma generate --schema .venv/lib/python3.*/site-packages/litellm/proxy/schema.prisma
```

DB를 붙인 Proxy는 기동할 때 `litellm_proxy_extras`가 migration을 적용하므로 첫 기동이 20초 안팎으로 늘어난다. 기동 로그에 `Unable to find Prisma binaries`가 나오면 위 `prisma generate` 명령을 다시 실행한다.

## 5. Ollama 판정 모델 준비 (4단계부터)

4·5단계는 질문을 보낼 모델을 로컬 소형 모델 `gemma2:2b`에게 묻는다. Ollama를 설치해 서버(기본 `localhost:11434`)가 떠 있는 상태에서, 아래 명령으로 모델(약 1.6GB)을 한 번 내려받는다.

```bash
ollama pull gemma2:2b
```

config가 `num_gpu: 0`을 넘기므로 GPU가 있어도 CPU로만 추론한다. 판정 한 번에 Apple M3 Pro CPU 기준 10~20초가 걸린다.

## 6. mock 검색 서버 기동 (7단계)

7단계는 SearXNG JSON API 형식을 흉내 내는 로컬 mock 서버가 필요하다. 외부 인터넷을 쓰지 않으며, 아래 명령으로 별도 터미널에서 띄우고 `Ctrl+C`로 끈다.

mock 대신 실제 SearXNG 인스턴스를 붙일 때는 **요청을 1분에 5회 이하로 유지한다.** SearXNG는 Google 같은 상위 검색 엔진에 요청을 대신 보내므로, 반복 실행으로 요청이 몰리면 내 IP가 스팸 봇으로 차단될 수 있다.

```bash
uv run python scripts/mock_searxng.py
```

## 7. 기동 확인

Proxy가 요청을 받을 수 있는 상태인지 다른 터미널에서 liveness endpoint를 호출해 확인한다. 이 endpoint는 인증 없이 응답한다.

```bash
curl -s localhost:4100/health/liveliness
```

## 8. 테스트 실행

단계별 pytest는 Router와 외부 호출을 mock으로 대체하므로 Proxy와 Ollama를 띄우지 않고도 돈다. 아래 명령은 전체 테스트를 한 번에 실행한다.

```bash
uv run pytest
```

## 9. 정리

Proxy는 띄운 터미널에서 `Ctrl+C`로 끈다. 그 터미널을 잃어버렸으면 아래 명령으로 프로세스 이름을 찾아 끈다.

```bash
pkill -f "litellm --config"
```

Postgres는 volume까지 지우므로, DB에 쌓인 spend log도 함께 사라진다.

```bash
docker compose down -v
```
