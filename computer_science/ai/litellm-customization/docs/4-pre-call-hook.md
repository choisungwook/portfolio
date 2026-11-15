# 3단계. 첫 pre_call 훅으로 spend_logs_metadata 남기기

## 이번 단계에서 배울 개념

- **pre_call 훅의 실행 시점과 역할**: pre_call 훅은 `CustomLogger.async_pre_call_hook`을 구현한 객체로, Proxy가 인증을 마치고 Router를 호출하기 **직전**에 실행된다. 훅이 반환한 dict가 그대로 다음 단계의 요청 본문으로 전달된다.
- **callbacks 문자열 해석 규칙**: `litellm_settings.callbacks`에 지정한 `"gateway.metadata_tagger.metadata_tagger"`는 `"모듈 경로.인스턴스 이름"` 형식이다. Proxy는 마지막 점(`.`) 앞부분을 모듈로 import하고 뒷부분을 해당 모듈의 속성으로 조회하므로, 클래스 자체가 아니라 **이미 생성된 인스턴스**를 가리켜야 한다.
- **`spend_logs_metadata`를 통한 요청 추적**: 요청의 `metadata.spend_logs_metadata`에 기록한 dict는 DB의 `LiteLLM_SpendLogs.metadata` 컬럼에 그대로 저장된다. 훅이 내린 라우팅·태깅 판단을 요청 단위로 추적할 때 가장 단순하게 활용할 수 있는 경로다.

### 용어 정리

| 용어 | 설명 | 이 실습의 예 |
| --- | --- | --- |
| `CustomLogger` | LiteLLM 콜백의 기반 클래스 (로깅 메서드와 Proxy 훅 메서드를 함께 제공) | `MetadataTagger` |
| pre_call 훅 | Router 호출 전 요청 본문을 수정하거나 거절하는 메서드 | `async_pre_call_hook` |
| `callbacks` | Proxy 기동 시 동적으로 import해 등록하는 콜백 목록 | `["gateway.metadata_tagger.metadata_tagger"]` |
| spend log | 요청마다 한 행씩 DB에 적재되는 사용 및 비용 이력 | `LiteLLM_SpendLogs` 테이블 |
| `spend_logs_metadata` | spend log의 `metadata` 컬럼에 사용자가 주입하는 자유 형식 dict | `{"chatbot": "qa-bot", "tagged_by": "metadata_tagger"}` |

## LiteLLM 내부 동작 위치

| 순서 | 동작 | 소스 경로 | 함수 |
| --- | --- | --- | --- |
| 1 | 설정의 `callbacks` 문자열 목록을 순회하며 내장 콜백 이름이 아니면 import한다 | `proxy/common_utils/callback_utils.py` | `initialize_callbacks_on_proxy` |
| 2 | 문자열을 마지막 점에서 분리해 모듈과 인스턴스 이름을 얻는다 (config 옆 파일 탐색 후 없으면 `importlib.import_module` 사용) | `proxy/types_utils/utils.py` | `get_instance_fn` |
| 3 | 요청마다 등록된 콜백을 순회하며 `async_pre_call_hook`을 호출한다 | `proxy/utils.py` | `ProxyLogging.pre_call_hook` |
| 4 | 훅 반환값을 해석한다 (`dict`면 요청 본문 교체, `str`이면 거절 메시지, `Exception`이면 그대로 전파) | `proxy/utils.py` | `ProxyLogging.process_pre_call_hook_response` |
| 5 | 응답 완료 후 spend log 행을 생성하면서 `metadata.spend_logs_metadata`를 옮겨 담는다 | `proxy/spend_tracking/spend_tracking_utils.py` | `_get_spend_logs_metadata` |

3번 단계에는 놓치기 쉬운 제약이 있다. `ProxyLogging.pre_call_hook`은 `"async_pre_call_hook" in vars(_callback.__class__)` 조건으로 메서드 존재 여부를 검사한다. 즉, 해당 메서드가 **그 클래스 자신에** 직접 정의되어 있어야 하며, 부모 클래스로부터 상속만 받은 경우에는 호출되지 않는다. 훅 클래스를 상속으로 재사용하려면 자식 클래스에서도 `async_pre_call_hook`을 다시 선언해야 한다.

2번 단계와 관련해 이 핸즈온은 설정 파일을 `config/` 디렉터리 아래에 두므로, config 옆 경로에서 `gateway/metadata_tagger.py`를 찾는 시도는 실패하고 `importlib` 경로로 넘어간다. 이를 위해 `pyproject.toml`에 `gateway` 패키지를 빌드 대상으로 등록해 `uv sync` 시 가상환경에 설치되도록 구성했다. 패키지로 설치하지 않으면 `uv run litellm`의 import 경로에 workspace 루트가 포함되지 않아 모듈을 찾을 수 없다.

## 코드 및 설정

[gateway/metadata_tagger.py](../gateway/metadata_tagger.py)는 클라이언트가 이미 전달한 `spend_logs_metadata` 값을 덮어쓰지 않도록 기존 dict와 병합한다. 4단계 이후에 구현하는 훅도 판단 근거를 남길 때 `add_spend_logs_metadata` 헬퍼를 재사용한다.

```python
def add_spend_logs_metadata(data: dict, values: dict) -> dict:
  metadata = data.setdefault("metadata", {})
  metadata["spend_logs_metadata"] = {**(metadata.get("spend_logs_metadata") or {}), **values}
  return data


class MetadataTagger(CustomLogger):
  async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type) -> dict:
    return add_spend_logs_metadata(data, {"chatbot": "qa-bot", "tagged_by": "metadata_tagger"})


metadata_tagger = MetadataTagger()
```

아래는 [config/3-pre-call-hook.yaml](../config/3-pre-call-hook.yaml)에서 `chat-small` 모델 외에 콜백 등록과 DB 연결을 추가한 설정 부분이다.

```yaml
litellm_settings:
  callbacks: ["gateway.metadata_tagger.metadata_tagger"]

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
```

## 실행 및 검증

### 1. Postgres 기동 및 Prisma client 생성

[1-setup.md의 4번](1-setup.md#4-postgres-기동-3단계부터) 절차를 따라 `docker compose up -d --wait` 실행, `.env`의 `DATABASE_URL` 주석 해제, `prisma generate` 명령을 완료한다.

### 2. Proxy 기동

Postgres가 준비되면 콜백과 DB 연결 설정이 포함된 `config/3-pre-call-hook.yaml`로 Proxy를 기동한다.

```bash
uv run --env-file .env litellm --config config/3-pre-call-hook.yaml --port 4100
```

기동 로그에서 Prisma 마이그레이션 적용 결과와 등록된 모델 목록을 확인한다.

```text
... litellm_proxy_extras - INFO - Acquired the Prisma migration lock
... prisma migrate deploy stdout: Prisma schema loaded from schema.prisma
225 migrations found in prisma/migrations
LiteLLM: Proxy initialized with Config, Set models:
    chat-small
```

최초 기동 시에는 마이그레이션 적용으로 인해 기동 시간이 길어진다. 이미 마이그레이션이 완료된 DB라면 `No pending migrations to apply.` 로그가 함께 출력된다.

### 3. 훅을 거칠 요청 전송

훅이 추가한 값은 HTTP 응답이 아니라 DB의 spend log에 기록되므로, 먼저 `chat-small`로 요청 1건을 전송한 뒤 다음 단계에서 DB를 조회한다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-small", "messages": [{"role": "user", "content": "LiteLLM이 뭐야?"}]}'
```

### 4. spend log 적재 확인

spend log는 응답 반환과 동시에 INSERT되지 않고 내부 큐에 모였다가 배치(batch)로 기록된다. 이 실습 환경에서는 응답 후 약 8초 뒤에 행이 생성되었다. 충분히 대기한 뒤 아래 명령으로 가장 최근 spend log 행의 `request_id`, `model`, `model_group`, `spend_logs_metadata`를 조회한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select request_id, model, model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 1"
```

조회 결과의 마지막 컬럼에 훅이 주입한 `chatbot`과 `tagged_by` 키가 포함되어 있는지 확인한다.

```text
chatcmpl-11e50a21-5ea8-492b-9fbe-6459fe90f729|openai/mock-small|chat-small|{"chatbot": "qa-bot", "tagged_by": "metadata_tagger"}
```

`request_id`는 클라이언트가 받은 응답 본문의 `id`와 동일하므로, 개별 응답과 spend log 레코드를 연결하는 식별자가 된다. 같은 행의 `messages`와 `response` 컬럼은 `{}`로 비어 있는데, 기본 설정에서는 프롬프트와 응답 원문을 spend log에 저장하지 않기 때문이다. 따라서 이후 단계의 훅에서도 질문 원문 대신 라우팅 판단 결과만 `spend_logs_metadata`에 기록한다.

### 5. 잘못된 인스턴스 이름으로 기동 시 오류 확인

`callbacks` 값을 `"gateway.metadata_tagger.no_such_instance"`처럼 존재하지 않는 속성으로 변경해 기동하면 Proxy가 시작되지 않고 다음과 같은 오류가 발생한다.

```text
AttributeError: module 'gateway.metadata_tagger' has no attribute 'no_such_instance'
ERROR:    Application startup failed. Exiting.
```

모듈(`gateway.metadata_tagger`) 자체는 정상적으로 찾았으나, 그 내부에서 속성을 꺼내는 `getattr` 단계에서 실패한 것이다. 이는 위 내부 동작 표 2번의 해석 과정을 그대로 보여 준다.

## 단위 테스트

[tests/test_3_pre_call_hook.py](../tests/test_3_pre_call_hook.py)는 Proxy와 DB 없이 훅 메서드와 콜백 해석 함수를 직접 호출해 검증한다.

| 테스트 | 검증 내용 |
| --- | --- |
| `test_hook_adds_spend_logs_metadata` | 훅이 `metadata.spend_logs_metadata`에 두 키를 정상 추가함 |
| `test_hook_keeps_client_spend_logs_metadata` | 클라이언트가 보낸 기존 메타데이터가 유실되지 않고 병합됨 |
| `test_callback_string_resolves_to_module_instance` | `get_instance_fn`이 콜백 문자열을 해당 모듈의 인스턴스 객체로 변환함 |

아래 명령으로 3단계 단위 테스트만 실행한다.

```bash
uv run pytest tests/test_3_pre_call_hook.py
```

마지막 줄에서 세 테스트가 모두 통과했는지 확인한다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`MetadataTagger`를 상속한 `ChildTagger` 클래스를 작성하되 `async_pre_call_hook`을 재정의하지 않은 채 콜백으로 등록해 본다. 앞서 설명한 `vars(_callback.__class__)` 검사 때문에 훅이 건너뛰어져 spend log에 `tagged_by`가 기록되지 않는지 확인한다. 이후 자식 클래스에 `async def async_pre_call_hook(self, *args, **kwargs): return await super().async_pre_call_hook(*args, **kwargs)`를 추가했을 때 다시 정상 기록되는지 비교해 본다.
