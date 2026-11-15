# 1단계. mock 모델로 로컬 Proxy 기동

## 이번 단계에서 배울 개념

- **모델 별칭과 실제 deployment의 분리**: 클라이언트는 `model_name`(별칭)만 알면 되며, 실제 provider 모델 정보는 `litellm_params.model` 뒤에 추상화된다. Proxy는 기동 시 `model_list`를 읽어 Router를 구성하고, 요청의 `model` 필드를 해당 별칭으로 매핑한다.
- **비용 없는 mock 응답**: `litellm_params.mock_response`를 설정하면 LiteLLM은 외부 provider를 호출하지 않고 지정된 문자열로 OpenAI 호환 응답을 생성한다. 이후 모든 단계는 이 mock 모델 위에서 API 비용 없이 진행한다.
- **단일 master key 인증**: virtual key를 발급하지 않고 `general_settings.master_key` 하나로 인증을 처리한다. DB가 연결되어 있지 않으므로 master key와 일치하지 않는 key는 조회할 대상이 없어 거절된다.

예제 도메인은 일반 Q&A 챗봇이다. 가벼운 질문은 `chat-small`, 무거운 질문은 `chat-large`가 처리한다고 가정하고, `chat-large`에는 1초의 지연을 부여해 느린 대형 모델의 응답 특성을 시뮬레이션한다. 라우팅과 fallback의 기본 개념은 [LiteLLM 핸즈온의 3-routing.md](../../litellm/docs/3-routing.md)에서 다뤘으므로, 이 핸즈온은 그 위에 코드로 확장 지점을 붙이는 데 집중한다.

### 용어 정리

| 용어 | 설명 | 이 실습의 예 |
| --- | --- | --- |
| `model_name` | 클라이언트가 `model` 필드에 지정하는 별칭 (Router에서는 model group이라 지칭) | `chat-small`, `chat-large` |
| deployment | 하나의 별칭에 묶인 실제 호출 대상 (`litellm_params`로 정의) | `openai/mock-small` |
| `mock_response` | 외부 provider 호출 대신 반환할 고정 응답 문자열 | `small 모델의 mock 응답입니다.` |
| `mock_delay` | mock 응답 반환 전 대기 시간(초) | `chat-large`에 1초 설정 |
| master key | Proxy 관리자 key (`sk-` 접두사 필수) | `.env`의 `LITELLM_MASTER_KEY` |

## LiteLLM 내부 동작 위치

경로는 LiteLLM 1.109.1 기준이며 `.venv/lib/python3.*/site-packages/litellm/` 아래 상대 경로다. 줄 번호는 버전에 따라 달라질 수 있으므로 함수 이름을 기준으로 확인한다.

| 순서 | 동작 | 소스 경로 | 함수 |
| --- | --- | --- | --- |
| 1 | CLI가 uvicorn으로 FastAPI 앱을 실행한다 | `proxy/proxy_cli.py` | `run_server` |
| 2 | 시작 시 config.yaml을 읽어 `model_list`로 Router를 생성한다 | `proxy/proxy_server.py` | `proxy_startup_event` → `ProxyConfig.load_config` |
| 3 | `Authorization` 헤더 값을 master key와 비교한다 | `proxy/auth/user_api_key_auth.py` | `user_api_key_auth_builder` (`secrets.compare_digest(api_key, master_key)`) |
| 4 | `/v1/models` 요청에 대해 Router에 등록된 별칭 목록을 반환한다 | `proxy/proxy_server.py` | `model_list` |
| 5 | `/v1/chat/completions` 요청을 Router로 전달한다 | `proxy/proxy_server.py`, `proxy/route_llm_request.py` | `chat_completion` → `route_request` |
| 6 | 설정된 `mock_delay`만큼 비동기 대기한다 | `main.py` | `acompletion` |
| 7 | `mock_response`가 존재하면 provider 호출 대신 mock 응답을 생성한다 | `main.py` | `completion` → `mock_completion` |
| 8 | 응답 본문의 `model` 필드를 클라이언트가 요청한 별칭으로 덮어쓴다 | `proxy/common_request_processing.py` | `_override_openai_response_model` |

3번 단계에서 master key와 일치하지 않으면 LiteLLM은 해당 key를 DB의 virtual key로 간주하고 조회를 시도한다. 이번 단계에서는 DB를 연결하지 않았으므로 `No connected db.` 오류가 반환된다. 또한 8번 동작 때문에 응답 본문의 `model` 필드에는 실제 deployment(`openai/mock-small`)가 아니라 요청한 별칭이 기록되며, 실제로 어느 deployment가 응답했는지는 응답 헤더 `x-litellm-model-name`을 통해 확인해야 한다.

## 코드 및 설정

[config/1-basic.yaml](../config/1-basic.yaml)에 mock 모델 2개와 master key를 정의한다. `os.environ/` 접두사는 해당 값을 환경 변수에서 읽어 오도록 지시하는 LiteLLM 표기법이다.

```yaml
model_list:
  - model_name: chat-small
    litellm_params:
      model: openai/mock-small
      mock_response: "small 모델의 mock 응답입니다."
  - model_name: chat-large
    litellm_params:
      model: openai/mock-large
      mock_response: "large 모델의 mock 응답입니다."
      mock_delay: 1

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

`model`의 `openai/` 접두사는 provider 유형을 지정하기 위한 형식일 뿐이며, `mock_response`가 설정되어 있으므로 실제로 OpenAI API로 요청이 전송되지 않는다. `api_key` 설정을 생략해도 동작하는 이유도 같다.

## 실행 및 검증

### 1. Proxy 기동

패키지 설치와 `.env` 준비는 [1-setup.md](1-setup.md)를 따른다. 환경 준비가 끝나면 mock 모델 2개를 등록한 `config/1-basic.yaml`로 Proxy를 기동한다.

```bash
uv run --env-file .env litellm --config config/1-basic.yaml --port 4100
```

### 2. 등록된 모델 목록 조회

Proxy가 기동 시 `model_list`를 읽어 Router에 별칭을 정상적으로 등록했는지 `/v1/models` endpoint로 확인한다.

```bash
curl -s localhost:4100/v1/models -H "Authorization: Bearer sk-local-master-key"
```

응답의 `data` 배열에 포함된 `id` 값을 확인한다.

```text
{"data":[{"id":"chat-small","object":"model","created":1677610602,"owned_by":"openai"},{"id":"chat-large","object":"model","created":1677610602,"owned_by":"openai"}],"object":"list"}
```

`id`에는 설정에 정의한 별칭 `chat-small`과 `chat-large`만 노출되며, `litellm_params.model`에 지정한 내부 모델 이름은 외부에 드러나지 않는다.

### 3. chat-large 호출 및 응답 시간 확인

별칭 등록을 확인했으므로 `mock_delay: 1`이 설정된 `chat-large`를 `time` 명령과 함께 호출해 의도한 지연이 발생하는지 측정한다.

```bash
time curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "chat-large", "messages": [{"role": "user", "content": "LiteLLM이 뭐야?"}]}'
```

응답 본문의 `content`에 `chat-large`의 `mock_response`가 담겼는지, 그리고 마지막 줄의 `total`에서 소요 시간이 1초 이상인지 확인한다.

```text
{"id":"chatcmpl-6cc24777-...","created":1794533531,"model":"chat-large","object":"chat.completion","choices":[{"finish_reason":"stop","index":0,"message":{"content":"large 모델의 mock 응답입니다.","role":"assistant"}}],"usage":{"completion_tokens":20,"prompt_tokens":10,"total_tokens":30}}
... 1.223 total
```

`id`와 `created`는 호출마다 달라진다. 같은 요청을 `chat-small`로 보내면 약 0.05초 내에 완료되므로, 두 별칭 사이의 1초 차이가 곧 `mock_delay`에 해당한다. `usage` 역시 실제 토큰 계산 결과가 아니라 `mock_completion`이 채워 넣는 고정값이다.

### 4. 응답 헤더를 통한 실제 deployment 확인

앞선 호출의 응답 본문 `model` 필드에는 실제 deployment 대신 별칭 `chat-large`가 기록되어 있었다. 실제로 어느 deployment가 응답했는지 확인하려면 응답 헤더를 조회해야 하므로, 아래 명령으로 본문을 제외하고 `x-litellm-model` 접두사를 가진 헤더만 필터링한다.

```bash
curl -s -D - -o /dev/null localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "chat-small", "messages": [{"role": "user", "content": "hi"}]}' | grep -i x-litellm-model
```

출력된 헤더 중 `x-litellm-model-group`과 `x-litellm-model-name` 두 항목을 비교한다.

```text
x-litellm-model-id: cedc8d82c1073deff0c735b588bafed8aa2f4c9513ddf0d16a1c9e4dfa27b0af
x-litellm-model-name: openai/mock-small
x-litellm-model-api-base: https://api.openai.com
x-litellm-model-group: chat-small
```

`x-litellm-model-group`은 클라이언트가 호출한 별칭이고, `x-litellm-model-name`은 실제로 선택된 deployment의 모델이다. 본문 `model` 필드는 별칭으로 덮어쓰이므로(위 동작 표 8번) 디버깅 시에는 이 헤더를 기준으로 판단한다. 참고로 `x-litellm-model-id`는 deployment 설정의 해시값이므로 설정이 변경되면 함께 바뀐다.

### 5. 인증 실패 및 미등록 모델 호출 확인

이번에는 master key가 아닌 잘못된 값(`sk-wrong`)으로 요청을 전송해 인증 실패 시 반환되는 오류 형식을 확인한다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-wrong" \
  -H "Content-Type: application/json" \
  -d '{"model": "chat-small", "messages": [{"role": "user", "content": "hi"}]}'
```

오류 본문의 `message`와 `code` 필드를 확인한다.

```text
{"error":{"message":"No connected db.","type":"no_db_connection","param":null,"code":"400"}}
```

401 Unauthorized 대신 400 `No connected db.`가 반환된다. master key 비교에 실패한 key를 virtual key로 판단해 DB 조회를 시도했으나, 연결된 DB가 없어 그 단계에서 실패했기 때문이다.

key가 유효하더라도 `model_list`에 없는 별칭을 지정하면 Router가 요청을 거절한다. 예를 들어 `model=gpt-4o`로 호출하면 `/v1/models`로 사용 가능한 모델을 확인하라는 안내 메시지가 반환된다.

```text
{"error":{"message":"/chat/completions: Invalid model name passed in model=gpt-4o. Call `/v1/models` to view available models for your key.", ...}}
```

### 6. OpenAI SDK를 이용한 호출

지금까지 curl로 확인한 동작이 OpenAI SDK에서도 동일하게 재현되는지 검증하기 위해, `base_url`만 로컬 Proxy 주소로 지정해 모델 목록 조회와 채팅 요청을 실행한다. `openai` 패키지는 LiteLLM 의존성에 포함되어 이미 설치되어 있다.

```bash
uv run python - <<'EOF'
from openai import OpenAI
client = OpenAI(base_url="http://localhost:4100", api_key="sk-local-master-key")
print([m.id for m in client.models.list()])
r = client.chat.completions.create(model="chat-small", messages=[{"role": "user", "content": "LiteLLM이 뭐야?"}])
print(r.model, "|", r.choices[0].message.content)
EOF
```

첫 줄은 등록된 모델 목록이고, 둘째 줄은 응답의 `model`과 메시지 본문이다. SDK 응답에서도 `model` 필드는 별칭인 `chat-small`로 반환된다.

```text
['chat-small', 'chat-large']
chat-small | small 모델의 mock 응답입니다.
```

## 단위 테스트

[tests/test_1_basic.py](../tests/test_1_basic.py)는 Proxy 서버를 띄우지 않고 동일한 `model_list`로 `litellm.Router` 인스턴스를 직접 생성해 검증한다. mock 모델을 사용하므로 외부 네트워크 호출은 발생하지 않는다.

| 테스트 | 검증 내용 |
| --- | --- |
| `test_config_registers_two_aliases` | 설정 파일의 별칭 2개가 Router에 정상 등록됨 |
| `test_alias_returns_its_mock_response` | 각 별칭이 자신의 deployment에 설정된 `mock_response`를 반환함 |
| `test_mock_delay_slows_down_large_model` | `mock_delay: 1` 설정이 실제로 1초 이상의 지연을 발생시킴 |

아래 명령으로 1단계 단위 테스트만 실행한다.

```bash
uv run pytest tests/test_1_basic.py
```

마지막 줄에서 세 테스트가 모두 통과했는지 확인한다.

```text
...                                                                      [100%]
3 passed in 4.61s
```

## 실험 과제

`chat-small` 설정에 `mock_response: "litellm.RateLimitError"`를 입력하고 Proxy를 재기동한 뒤 호출해 본다. `main.py`의 `_handle_mock_potential_exceptions` 함수가 이 특수 문자열을 실제 provider의 429 오류로 변환해 예외를 발생시킨다. 2단계에서 의도적으로 실패하는 deployment를 이 방식으로 구성하므로, 응답의 HTTP 상태 코드와 오류 `type`을 미리 확인해 두면 fallback 동작을 이해하는 데 도움이 된다.
