# 3단계. 첫 pre_call 훅으로 spend_logs_metadata 남기기

## 이번 단계에서 배울 개념

- pre_call 훅은 `CustomLogger.async_pre_call_hook`을 구현한 객체다. Proxy가 인증을 마치고 Router를 부르기 **직전**에 실행되며, 훅이 돌려준 dict가 그대로 다음 단계의 요청 본문이 된다.
- `litellm_settings.callbacks`의 `"gateway.metadata_tagger.metadata_tagger"`는 "모듈 경로.인스턴스 이름"이다. Proxy는 마지막 점 앞을 모듈로 import하고, 뒤를 그 모듈의 속성으로 꺼낸다. 클래스가 아니라 **이미 만들어진 인스턴스**를 가리켜야 한다.
- 요청의 `metadata.spend_logs_metadata`에 넣은 dict는 DB의 `LiteLLM_SpendLogs.metadata` 컬럼에 그대로 남는다. 훅이 내린 판단을 요청 단위로 추적하는 가장 단순한 통로다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| CustomLogger | LiteLLM 콜백의 기반 클래스. 로깅 메서드와 Proxy 훅 메서드를 함께 가진다 | `MetadataTagger` |
| pre_call 훅 | Router 호출 전 요청을 고치거나 거절하는 메서드 | `async_pre_call_hook` |
| callbacks | Proxy가 시작할 때 import해 등록하는 콜백 목록 | `["gateway.metadata_tagger.metadata_tagger"]` |
| spend log | 요청마다 한 줄씩 DB에 쌓이는 사용 기록 | `LiteLLM_SpendLogs` 테이블 |
| spend_logs_metadata | spend log의 `metadata` 컬럼에 사용자가 넣는 자유 형식 dict | `{"chatbot": "qa-bot", "tagged_by": "metadata_tagger"}` |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | config의 `callbacks` 문자열 목록을 하나씩 처리한다. 내장 이름이 아니면 import한다 | `proxy/common_utils/callback_utils.py` | `initialize_callbacks_on_proxy` |
| 2 | 문자열을 마지막 점에서 나눠 모듈과 인스턴스 이름을 얻는다. config 파일 옆에 `gateway/metadata_tagger.py`가 있으면 그 파일을, 없으면 `importlib.import_module`로 찾는다 | `proxy/types_utils/utils.py` | `get_instance_fn` |
| 3 | 요청마다 등록된 콜백을 순서대로 돌며 `async_pre_call_hook`을 부른다 | `proxy/utils.py` | `ProxyLogging.pre_call_hook` |
| 4 | 훅의 반환값을 해석한다. dict면 새 요청 본문, str이면 거절 메시지, Exception이면 그대로 던진다 | `proxy/utils.py` | `ProxyLogging.process_pre_call_hook_response` |
| 5 | 응답 뒤에 spend log 한 줄을 만들며 `metadata.spend_logs_metadata`를 옮겨 담는다 | `proxy/spend_tracking/spend_tracking_utils.py` | `_get_spend_logs_metadata` |

3번에는 놓치기 쉬운 조건이 있다. `ProxyLogging.pre_call_hook`은 `"async_pre_call_hook" in vars(_callback.__class__)`로 검사한다. 즉 메서드가 **그 클래스 자신에** 정의되어 있어야 하고, 중간 기반 클래스에서 물려받기만 하면 호출되지 않는다. 훅 클래스를 상속으로 재사용하려면 자식 클래스에서도 메서드를 다시 선언해야 한다.

2번에서 이 핸즈온은 config를 `config/` 아래에 두므로 config 옆 파일 탐색은 실패하고 `importlib`로 넘어간다. 그래서 `pyproject.toml`에 `gateway` 패키지를 빌드 대상으로 등록해 `uv sync`가 가상환경에 설치하게 했다. 설치하지 않으면 `uv run litellm`의 import 경로에 workspace 디렉터리가 없어 모듈을 찾지 못한다.

## 코드와 config

[gateway/metadata_tagger.py](../gateway/metadata_tagger.py)는 클라이언트가 이미 보낸 `spend_logs_metadata`를 지우지 않도록 기존 값에 합친다. 아래는 3단계 시점의 단순화한 발췌이고, 실제 파일의 `add_spend_logs_metadata`에는 11단계에서 추가한 `decisions` 목록 분기가 더 있다.

```python
def add_spend_logs_metadata(data: dict, values: dict) -> dict:
  metadata = data.setdefault("metadata", {})
  spend_logs_metadata = metadata.get("spend_logs_metadata") or {}
  metadata["spend_logs_metadata"] = {**spend_logs_metadata, **values}
  return data


class MetadataTagger(CustomLogger):
  async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type) -> dict:
    return add_spend_logs_metadata(data, {"chatbot": "qa-bot", "tagged_by": "metadata_tagger"})


metadata_tagger = MetadataTagger()
```

[config/3-pre-call-hook.yaml](../config/3-pre-call-hook.yaml)은 콜백 한 줄과 DB 연결을 더한다.

```yaml
litellm_settings:
  callbacks: ["gateway.metadata_tagger.metadata_tagger"]

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
```

## 실행

### 1. Postgres 기동과 Prisma client 생성

[1-setup.md의 4번](1-setup.md)을 따라 `docker compose up -d --wait`, `.env`의 `DATABASE_URL` 주석 해제, `prisma generate`를 마친다.

### 2. Proxy 기동

Postgres가 준비되면 콜백과 DB 연결을 더한 config로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/3-pre-call-hook.yaml --port 4100
```

기동 로그에서 migration 적용 줄과 등록된 모델 목록을 본다.

```text
... litellm_proxy_extras - INFO - Acquired the Prisma migration lock
... prisma migrate deploy stdout: Prisma schema loaded from schema.prisma
225 migrations found in prisma/migrations
LiteLLM: Proxy initialized with Config, Set models:
    chat-small
```

첫 기동에서는 migration을 적용하느라 시간이 걸린다. 이미 적용된 DB라면 `No pending migrations to apply.`가 함께 나온다.

### 3. 훅을 거칠 요청 한 건 전송

훅이 넣은 값은 응답이 아니라 spend log에 남으므로, 여기서는 `chat-small`로 요청 한 건만 보내고 다음 단계에서 DB를 조회한다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-small", "messages": [{"role": "user", "content": "LiteLLM이 뭐야?"}]}'
```

### 4. spend log 확인

spend log는 응답과 동시에 쓰이지 않고 큐에 모였다가 일괄로 기록된다. 이 실습에서는 응답 뒤 8초 안팎에 행이 생겼다. 행이 생긴 뒤 아래 명령으로 가장 최근 spend log 한 행에서 `request_id`, `model`, `model_group`, `spend_logs_metadata`를 꺼낸다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select request_id, model, model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 1"
```

마지막 칸에 훅이 넣은 `chatbot`과 `tagged_by`가 있는지 본다.

```text
chatcmpl-11e50a21-5ea8-492b-9fbe-6459fe90f729|openai/mock-small|chat-small|{"chatbot": "qa-bot", "tagged_by": "metadata_tagger"}
```

`request_id`는 응답 본문의 `id`와 같으므로, 사용자가 받은 응답과 spend log를 잇는 key가 된다. 같은 행의 `messages`, `response` 컬럼은 `{}`인데, 기본 설정에서는 프롬프트와 응답 원문을 spend log에 저장하지 않기 때문이다. 11단계에서 이 기본값을 이용한다.

### 5. 잘못된 인스턴스 이름으로 기동할 때의 오류

`callbacks`를 `"gateway.metadata_tagger.no_such_instance"`로 바꿔 띄우면 Proxy가 시작하지 못하고, 기동 로그 끝에 다음 오류가 남는다.

```text
AttributeError: module 'gateway.metadata_tagger' has no attribute 'no_such_instance'
ERROR:    Application startup failed. Exiting.
```

모듈(`gateway.metadata_tagger`)은 찾았지만, 그 안에서 속성을 꺼내는 `getattr`에서 실패했다. 위 표 2번에서 본 동작 그대로다.

## 단위 테스트

[tests/test_3_pre_call_hook.py](../tests/test_3_pre_call_hook.py)는 Proxy와 DB 없이 훅 메서드를 직접 부른다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_hook_adds_spend_logs_metadata` | 훅이 `metadata.spend_logs_metadata`에 두 값을 넣는다 |
| `test_hook_keeps_client_spend_logs_metadata` | 클라이언트가 보낸 값이 지워지지 않고 합쳐진다 |
| `test_callback_string_resolves_to_module_instance` | `get_instance_fn`이 문자열을 모듈의 그 인스턴스로 바꾼다 |

아래 명령은 이 테스트 파일만 실행한다.

```bash
uv run pytest tests/test_3_pre_call_hook.py
```

마지막 줄에서 세 테스트가 모두 통과했는지 본다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`MetadataTagger`를 상속한 `ChildTagger`를 만들되 `async_pre_call_hook`을 다시 선언하지 않고 등록해 본다. 위에서 설명한 `vars(_callback.__class__)` 검사 때문에 훅이 실행되지 않아 spend log에 `tagged_by`가 빠지는지 확인한다. 그다음 자식 클래스에 `async def async_pre_call_hook(self, *args, **kwargs): return await super().async_pre_call_hook(*args, **kwargs)`를 추가하면 다시 기록되는지 비교한다.
