# 실습 환경 준비

이 핸즈온에서는 LiteLLM Proxy를 Docker 컨테이너 대신 로컬 Python 프로세스로 실행한다. 확장 지점(훅, custom provider)을 수정할 때마다 이미지를 다시 빌드할 필요가 없고, 가상환경에 설치된 LiteLLM 패키지 소스를 직접 열어 내부 동작을 추적할 수 있기 때문이다. 답변을 생성하는 모델은 모두 `mock_response`로 응답하므로 외부 provider의 API key나 과금이 필요 없다. 4·5단계의 판정 모델만 로컬 Ollama에서 실제로 실행한다.

## 준비물

| 항목 | 버전 | 비고 |
| --- | --- | --- |
| Python | 3.12 이상 | `uv`가 자동으로 설치 및 관리 |
| uv | 0.11 이상 | 패키지 및 가상환경 관리 |
| Docker | Compose v2 | 3단계부터 Postgres 실행에 사용 |
| Ollama | 0.12.11 기준 확인 | 4·5단계 판정 모델 `gemma2:2b` 로컬 실행 |
| LiteLLM | 1.109.1 | `pyproject.toml`에 고정 ([버전 결정 기록](../knowledge/decisions/2026-11-litellm-version.md)) |

## 1. 의존성 설치

먼저 핸즈온 workspace 디렉터리로 이동해 `pyproject.toml`에 정의된 의존성으로 가상환경을 구성한다.

```bash
cd computer_science/ai/litellm-customization
uv sync
```

## 2. master key 준비

Proxy 인증에 사용할 master key는 `.env` 파일에서 읽어 오므로 `.env.example`을 복사해 `.env`를 생성한다. `.env`는 `.gitignore`에 등록되어 있어 저장소에 커밋되지 않는다.

```bash
cp .env.example .env
```

## 3. Proxy 기동

Proxy는 각 단계에 맞는 설정 파일만 교체해 4100 포트로 실행한다. 아래 명령은 1단계 설정(`config/1-basic.yaml`)으로 Proxy를 기동한다.

```bash
uv run --env-file .env litellm --config config/1-basic.yaml --port 4100
```

기동 완료까지 8~15초 정도 걸린다. 로그 마지막에 `LiteLLM: Proxy initialized with Config, Set models:`와 함께 모델 별칭 목록이 출력되면 요청을 수신할 준비가 끝난 상태다.

## 4. Postgres 기동 (3단계부터)

3단계부터는 spend log를 Postgres에 저장하므로, 1·2단계만 진행할 때는 이 절차를 건너뛴다. 아래 명령으로 Postgres 컨테이너를 백그라운드에서 기동하고 healthcheck 통과까지 대기한다.

```bash
docker compose up -d --wait
```

컨테이너가 준비되면 `.env` 파일에서 `DATABASE_URL` 줄의 주석을 해제한다. Proxy가 DB에 접근하려면 Prisma client가 필요하므로, 아래 명령으로 LiteLLM 패키지에 포함된 schema 기반 client를 생성한다. 최초 실행 시에는 Prisma가 Node.js와 query engine 바이너리를 자동으로 내려받는다.

```bash
uv run prisma generate --schema .venv/lib/python3.*/site-packages/litellm/proxy/schema.prisma
```

DB를 연동한 Proxy는 기동 시 `litellm_proxy_extras`가 데이터베이스 마이그레이션을 적용하므로 첫 기동에 20초 안팎이 소요된다. 만약 기동 로그에 `Unable to find Prisma binaries` 오류가 발생하면 위 `prisma generate` 명령을 다시 실행한다.

## 5. Ollama 판정 모델 준비 (4단계부터)

4·5단계에서는 사용자 질문을 어느 모델로 보낼지 결정하기 위해 로컬 소형 모델 `gemma2:2b`를 사용한다. Ollama 서버(기본 `localhost:11434`)가 실행 중인 상태에서 아래 명령으로 모델(약 1.6GB)을 내려받는다.

```bash
ollama pull gemma2:2b
```

설정에 `num_gpu: 0`이 지정되어 있어 GPU가 있는 환경에서도 CPU로만 추론한다. Apple M3 Pro CPU 기준으로 판정 한 번에 10~20초가 소요된다.

## 6. mock 검색 서버 기동 (7단계)

7단계에서는 SearXNG JSON API 응답 형식을 모방한 로컬 mock 서버가 필요하다. 외부 네트워크를 사용하지 않으며, 아래 명령으로 별도 터미널에서 실행한 뒤 종료 시 `Ctrl+C`로 중단한다.

mock 서버 대신 실제 SearXNG 인스턴스를 연동할 때는 **요청 빈도를 1분에 5회 이하로 유지한다.** SearXNG는 Google 등 상위 검색 엔진에 질의를 대신 전달하므로, 짧은 시간에 요청이 몰리면 내 IP가 스팸 봇으로 차단될 수 있다.

```bash
uv run python scripts/mock_searxng.py
```

## 7. 기동 상태 확인

Proxy가 정상적으로 요청을 처리할 수 있는지 다른 터미널에서 liveness endpoint를 호출해 확인한다. 이 endpoint는 별도 인증 헤더 없이 응답한다.

```bash
curl -s localhost:4100/health/liveliness
```

## 8. 단위 테스트 실행

단계별 pytest 테스트는 Router와 외부 호출을 mock 객체로 대체하므로 Proxy나 Ollama를 띄우지 않고도 실행할 수 있다. 아래 명령은 전체 테스트를 한 번에 실행한다.

```bash
uv run pytest
```

## 9. 환경 정리

Proxy는 실행 중인 터미널에서 `Ctrl+C`를 눌러 종료한다. 해당 터미널을 닫았거나 백그라운드로 남아 있다면 프로세스 이름으로 찾아 종료한다.

```bash
pkill -f "litellm --config"
```

Postgres 컨테이너와 volume까지 함께 제거하려면 아래 명령을 실행한다. 이 경우 DB에 적재된 spend log 데이터도 모두 삭제된다.

```bash
docker compose down -v
```
