# 1단계. mock 모델로 로컬 Proxy 기동

## 이번 단계에서 배울 개념

- 클라이언트는 `model_name`(별칭)만 알고, 실제 provider 모델은 `litellm_params.model`에 숨겨진다. Proxy는 시작할 때 `model_list`로 Router를 만들고 요청의 `model`을 그 별칭으로 찾는다.
- `litellm_params.mock_response`가 있으면 LiteLLM은 provider를 호출하지 않고 그 문자열로 OpenAI 형식 응답을 만든다. 이후 모든 단계는 이 mock 모델 위에서 비용 없이 진행한다.
- virtual key 없이 `general_settings.master_key` 하나로 인증한다. DB가 없으므로 master key가 아닌 key는 검증할 곳이 없어 거절된다.

예제 도메인은 일반 Q&A 챗봇이다. 가벼운 질문은 `chat-small`, 무거운 질문은 `chat-large`가 받는다고 가정하고, `chat-large`는 1초 늦게 응답하게 해서 느린 모델을 흉내 낸다. 라우팅과 fallback의 개념 자체는 [LiteLLM 핸즈온의 3-routing.md](../../litellm/docs/3-routing.md)에서 다뤘으므로, 이 핸즈온은 그 위에 코드로 확장 지점을 붙이는 데 집중한다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
| --- | --- | --- |
| model_name | 클라이언트가 `model` 필드에 쓰는 별칭. Router에서는 model group이라고 부른다 | `chat-small`, `chat-large` |
| deployment | 별칭 하나에 묶인 실제 호출 대상 하나. `litellm_params`로 정의한다 | `openai/mock-small` |
| mock_response | provider 호출 대신 돌려줄 응답 문자열 | `small 모델의 mock 응답입니다.` |
| mock_delay | mock 응답 전에 쉬는 시간(초) | `chat-large`에 1초 |
| master key | Proxy 관리자 key. `sk-`로 시작해야 한다 | `.env`의 `LITELLM_MASTER_KEY` |

## LiteLLM 내부에서 일어나는 위치

경로는 LiteLLM 1.109.1 기준이며 `.venv/lib/python3.*/site-packages/litellm/` 아래 상대 경로다. 줄 번호는 버전마다 바뀌므로 함수 이름으로 찾는다.

| 순서 | 동작 | 소스 경로 | 함수 |
| --- | --- | --- | --- |
| 1 | CLI가 uvicorn으로 FastAPI 앱을 띄운다 | `proxy/proxy_cli.py` | `run_server` |
| 2 | 시작 시 config.yaml을 읽어 `model_list`로 Router를 만든다 | `proxy/proxy_server.py` | `proxy_startup_event` → `ProxyConfig.load_config` |
| 3 | `Authorization` 헤더를 master key와 비교한다 | `proxy/auth/user_api_key_auth.py` | `user_api_key_auth_builder` (`secrets.compare_digest(api_key, master_key)`) |
| 4 | `/v1/models`가 Router에 등록된 별칭을 돌려준다 | `proxy/proxy_server.py` | `model_list` |
| 5 | `/v1/chat/completions`가 요청을 Router로 넘긴다 | `proxy/proxy_server.py`, `proxy/route_llm_request.py` | `chat_completion` → `route_request` |
| 6 | `mock_delay`만큼 쉰다 | `main.py` | `acompletion` |
| 7 | `mock_response`가 있으면 provider 대신 mock 응답을 만든다 | `main.py` | `completion` → `mock_completion` |
| 8 | 응답의 `model` 필드를 클라이언트가 보낸 별칭으로 다시 쓴다 | `proxy/common_request_processing.py` | `_override_openai_response_model` |

3번에서 master key와 일치하지 않으면 그 key를 DB의 virtual key로 찾으러 간다. 이번 단계는 DB를 붙이지 않으므로 `No connected db.`로 끝난다. 8번 때문에 응답 본문의 `model`에는 실제 deployment(`openai/mock-small`)가 아니라 별칭이 찍힌다. 실제로 어느 deployment가 답했는지는 응답 헤더 `x-litellm-model-name`에서 확인한다.

## 코드와 config

[config/1-basic.yaml](../config/1-basic.yaml)에 mock 모델 2개와 master key만 둔다. `os.environ/` 접두사는 값을 환경 변수에서 읽으라는 LiteLLM의 표기다.

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

`model`의 `openai/` 접두사는 provider를 정할 뿐이고, `mock_response` 때문에 OpenAI로 요청이 나가지 않는다. `api_key`가 없어도 되는 이유도 같다.

## 실행

### 1. Proxy 기동

설치와 `.env` 준비는 [1-setup.md](1-setup.md)를 따른다. 준비가 끝났으면 mock 모델 2개를 등록한 `config/1-basic.yaml`로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/1-basic.yaml --port 4100
```

### 2. 등록된 모델 목록 조회

Proxy가 시작할 때 `model_list`를 읽어 Router에 별칭을 등록했는지 `/v1/models`로 조회한다.

```bash
curl -s localhost:4100/v1/models -H "Authorization: Bearer sk-local-master-key"
```

응답의 `data`에서 `id` 값을 본다.

```text
{"data":[{"id":"chat-small","object":"model","created":1677610602,"owned_by":"openai"},{"id":"chat-large","object":"model","created":1677610602,"owned_by":"openai"}],"object":"list"}
```

`id`에는 config에 적은 별칭 `chat-small`과 `chat-large`만 있고, `litellm_params.model`에 적은 실제 모델 이름은 드러나지 않는다.

### 3. chat-large 호출과 응답 시간 확인

별칭이 등록된 것을 확인했으니, `mock_delay: 1`을 준 `chat-large`를 `time`과 함께 호출해 지연이 실제로 생기는지 본다.

```bash
time curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "chat-large", "messages": [{"role": "user", "content": "LiteLLM이 뭐야?"}]}'
```

응답 본문의 `content`에는 `chat-large`의 `mock_response`가 담기고, 마지막 줄의 total에서 걸린 시간을 본다.

```text
{"id":"chatcmpl-6cc24777-...","created":1794533531,"model":"chat-large","object":"chat.completion","choices":[{"finish_reason":"stop","index":0,"message":{"content":"large 모델의 mock 응답입니다.","role":"assistant"}}],"usage":{"completion_tokens":20,"prompt_tokens":10,"total_tokens":30}}
... 1.223 total
```

`id`와 `created`는 실행마다 달라진다. 같은 요청을 `chat-small`로 보내면 0.05초 안팎에 끝나므로, 두 별칭 사이의 1초 차이가 곧 `mock_delay`다. `usage`도 실제 token 수가 아니라 `mock_completion`이 채우는 고정값이다.

### 4. 실제로 답한 deployment를 응답 헤더로 확인

앞 단계 응답 본문의 `model`에는 deployment가 아니라 별칭 `chat-large`가 찍혀 있었다. 실제로 어느 deployment가 답했는지는 헤더에 있으므로, 아래 명령은 본문을 버리고 `x-litellm-model`로 시작하는 헤더만 남긴다.

```bash
curl -s -D - -o /dev/null localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "chat-small", "messages": [{"role": "user", "content": "hi"}]}' | grep -i x-litellm-model
```

출력에서는 `x-litellm-model-group`과 `x-litellm-model-name` 두 줄을 비교한다.

```text
x-litellm-model-id: cedc8d82c1073deff0c735b588bafed8aa2f4c9513ddf0d16a1c9e4dfa27b0af
x-litellm-model-name: openai/mock-small
x-litellm-model-api-base: https://api.openai.com
x-litellm-model-group: chat-small
```

`x-litellm-model-group`은 별칭이고, `x-litellm-model-name`은 deployment의 실제 모델이다. 본문 `model`은 별칭으로 덮어쓰이므로(위 표 8번) 디버깅할 때는 이 헤더를 본다. `x-litellm-model-id`는 deployment 설정의 해시라서 config가 바뀌면 값도 달라진다.

### 5. 인증 실패와 없는 모델 호출

이번에는 master key가 아닌 `sk-wrong`으로 같은 요청을 보내, 인증에 실패한 key가 어떤 응답을 받는지 본다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-wrong" \
  -H "Content-Type: application/json" \
  -d '{"model": "chat-small", "messages": [{"role": "user", "content": "hi"}]}'
```

오류 본문의 `message`와 `code`를 본다.

```text
{"error":{"message":"No connected db.","type":"no_db_connection","param":null,"code":"400"}}
```

401이 아니라 400 `No connected db.`가 나온다. master key 비교에 실패한 key를 virtual key로 보고 DB에서 찾으려다, DB가 없어 그 자리에서 멈춘 것이다.

key가 맞더라도 등록하지 않은 별칭을 `model`에 넣으면 이번에는 Router가 거절한다. `model=gpt-4o`로 부르면 오류 메시지가 `/v1/models`로 사용 가능한 모델을 확인하라고 안내한다.

```text
{"error":{"message":"/chat/completions: Invalid model name passed in model=gpt-4o. Call `/v1/models` to view available models for your key.", ...}}
```

### 6. OpenAI SDK로 호출

지금까지 curl로 본 동작이 OpenAI SDK에서도 같은지, `base_url`만 Proxy로 바꿔 모델 목록 조회와 채팅 호출을 해 본다. `openai` 패키지는 LiteLLM 의존성으로 이미 설치되어 있다.

```bash
uv run python - <<'EOF'
from openai import OpenAI
client = OpenAI(base_url="http://localhost:4100", api_key="sk-local-master-key")
print([m.id for m in client.models.list()])
r = client.chat.completions.create(model="chat-small", messages=[{"role": "user", "content": "LiteLLM이 뭐야?"}])
print(r.model, "|", r.choices[0].message.content)
EOF
```

첫 줄은 모델 목록이고, 둘째 줄은 응답의 `model`과 본문이다. SDK로 받은 응답에서도 `model`은 별칭 `chat-small`로 찍힌다.

```text
['chat-small', 'chat-large']
chat-small | small 모델의 mock 응답입니다.
```

## 단위 테스트

[tests/test_1_basic.py](../tests/test_1_basic.py)는 Proxy를 띄우지 않고 같은 `model_list`로 `litellm.Router`를 직접 만든다. mock 모델이므로 외부 호출이 없다.

| 테스트 | 확인하는 것 |
| --- | --- |
| `test_config_registers_two_aliases` | config의 별칭 2개가 Router에 등록된다 |
| `test_alias_returns_its_mock_response` | 별칭이 자기 deployment의 `mock_response`로 답한다 |
| `test_mock_delay_slows_down_large_model` | `mock_delay: 1`이 실제로 1초 이상 지연을 만든다 |

아래 명령은 이 테스트 파일만 실행한다.

```bash
uv run pytest tests/test_1_basic.py
```

마지막 줄에서 세 테스트가 모두 통과했는지 본다.

```text
...                                                                      [100%]
3 passed in 4.61s
```

## 실험 과제

`chat-small`에 `mock_response: "litellm.RateLimitError"`를 넣고 Proxy를 다시 띄운 뒤 호출해 본다. `main.py`의 `_handle_mock_potential_exceptions`가 이 특수 문자열을 실제 provider의 429 오류로 바꿔 던진다. 2단계에서 "일부러 실패하는 deployment"를 이 방법으로 만들기 때문에, 응답의 HTTP 상태 코드와 오류 `type`이 무엇인지 미리 확인해 두면 fallback 동작을 읽기 쉽다.
