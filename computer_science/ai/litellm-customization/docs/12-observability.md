# 11단계. 판단 기록과 post_call 훅, 원문을 남기지 않는 관측

## 이번 단계에서 배울 개념

- 훅과 provider가 내린 판단을 `spend_logs_metadata.decisions` **목록**에 실행 순서대로 추가한다. 5단계에서 본 것처럼 dict는 Postgres `jsonb`에 저장되며 key 순서를 잃지만, 목록은 순서를 지킨다. spend log 한 행만 보면 "어느 훅이 무엇을 바꿨고, 어느 검색이 답했는지"가 복원된다.
- 관측 데이터에 사용자 원문을 넣지 않는다. 질문은 sha256 앞 16자와 글자 수만 남긴다. 같은 질문인지 비교할 수는 있지만 내용은 복원할 수 없다. LiteLLM도 기본 설정에서 spend log에 프롬프트와 응답 원문을 저장하지 않는다.
- post_call 훅(`async_post_call_success_hook`)은 응답이 클라이언트로 나가기 직전에 실행되어 응답을 고칠 수 있다. 다만 **비스트리밍 응답에만** 실행된다. 같은 요청을 스트리밍으로 보내면 이 훅을 건너뛰어 가리려던 연락처가 그대로 나갔다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| decision trail | 요청 하나에 대해 각 확장 지점이 내린 판단을 순서대로 모은 기록 | `spend_logs_metadata.decisions` |
| 질문 지문 | 원문 대신 남기는 해시와 길이 | `question_sha256: 3877a16dd7a0e47c`, `question_chars: 12` |
| post_call 훅 | 응답 생성 뒤, 클라이언트 전송 전에 실행되는 훅 | `ResponseMasker` |
| store_prompts_in_spend_logs | spend log에 프롬프트·응답 원문을 저장할지 정하는 설정. 기본값 false | 설정하지 않음 |
| turn_off_message_logging | 로깅 콜백(외부 관측 도구 연동 등)에 messages와 응답을 가려서 넘기는 설정 | `true` |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | pre_call 훅 체인이 요청 `metadata`를 고친다 | `proxy/utils.py` | `ProxyLogging.pre_call_hook` |
| 2 | custom provider의 `kwargs["litellm_params"]["metadata"]`는 로깅 객체가 보는 dict와 **같은 객체**다. 여기 쓴 값이 spend log로 이어진다 | `main.py` | `_complete_custom_providers` (`litellm_params` 전달) |
| 3 | 비스트리밍 응답에 post_call 훅을 실행한다 | `proxy/common_request_processing.py` → `proxy/utils.py` | `base_process_llm_request` → `ProxyLogging.post_call_success_hook` |
| 4 | spend log 행을 만들며 `metadata.spend_logs_metadata`를 옮긴다. 원문 저장 여부는 `store_prompts_in_spend_logs`가 정한다 | `proxy/spend_tracking/spend_tracking_utils.py` | `_get_spend_logs_metadata`, `get_logging_payload` |
| 5 | `turn_off_message_logging`이면 로깅 콜백에 넘기는 messages·응답을 가린다 | `litellm_core_utils/redact_messages.py` | `redact_message_input_output_from_custom_logger` |

2번의 근거는 문서가 아니라 실험이다. provider 안에서 이 dict의 `spend_logs_metadata`를 고친 뒤 spend log를 조회하니 그 값이 남아 있었고, `kwargs["logging_obj"].model_call_details["litellm_params"]["metadata"]`와 `is` 비교가 `True`였다. 8단계에서 "안쪽 호출이 spend log에 남지 않는다"는 문제를, 바깥 요청의 행에 판단을 기록하는 방식으로 보완하는 근거다.

## 코드와 config

3단계의 `add_spend_logs_metadata`에 목록 모드를 더했다. 체인 맨 앞의 `TrailStart`가 `decisions: []`를 만들어 두면 이후 모든 기록이 목록에 추가되고, 없으면 기존처럼 dict에 합친다. 그래서 3~10단계 config의 동작은 바뀌지 않는다.

```python
def add_spend_logs_metadata(data: dict, values: dict) -> dict:
  metadata = data.setdefault("metadata", {})
  spend_logs_metadata = metadata.get("spend_logs_metadata") or {}
  trail = spend_logs_metadata.get(TRAIL_KEY)
  if isinstance(trail, list):
    trail.extend({"hook": key, "detail": value} for key, value in values.items())
  else:
    spend_logs_metadata = {**spend_logs_metadata, **values}
  metadata["spend_logs_metadata"] = spend_logs_metadata
  return data
```

[gateway/decision_trail.py](../gateway/decision_trail.py)에 세 가지를 둔다.

| 이름 | 종류 | 하는 일 |
|---|---|---|
| `TrailStart` | pre_call 훅 | 질문 지문(`question_sha256`, `question_chars`)과 빈 `decisions` 목록을 만든다 |
| `record_from_provider` | 함수 | custom provider가 `kwargs`의 metadata에 판단을 남긴다. `GatewaySearchLLM`이 답한 검색 도구를 기록할 때 쓴다 |
| `ResponseMasker` | post_call 훅 | 응답의 이메일·휴대폰 번호를 `[email]`, `[phone]`으로 바꾸고 바꾼 개수를 남긴다 |

[config/11-observability.yaml](../config/11-observability.yaml)은 지금까지의 확장 지점을 한 체인으로 묶는다. 순서가 곧 우선순위다. 의도 분류가 `chat-small`/`chat-large`를 정한 뒤, 표식이 있으면 `feature_switch_to_search`가 `gateway-search`로 덮어쓴다.

```yaml
litellm_settings:
  custom_provider_map:
    - provider: gateway
      custom_handler: gateway.search_provider.gateway_search_code_fallback
  callbacks:
    - gateway.decision_trail.trail_start
    - gateway.intent_router.intent_router_memory
    - gateway.feature_switch.feature_switch_to_search
    - gateway.decision_trail.response_masker
  turn_off_message_logging: true
```

mock 응답에는 일부러 연락처를 넣었다. `chat-small`은 "자세한 내용은 <help@example.com> 또는 010-1234-5678로 문의하세요.", `chat-large`는 "large 모델 답변입니다. 담당자 메일은 <owner@example.com>입니다."로 답한다.

## 실행

Postgres와 mock 검색 서버가 떠 있어야 한다([1-setup.md의 4·5번](1-setup.md)).

### 1. Proxy 기동

decision trail 훅, 의도 분류, 표식 전환, 응답 마스킹을 한 체인으로 묶은 config로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/11-observability.yaml --port 4100
```

### 2. 경로가 다른 질문 세 개 보내기

spend log에 남는 판단이 경로마다 어떻게 달라지는지 비교하려면 서로 다른 경로를 타는 요청이 필요하다. 아래 세 질문은 각각 의도 분류(LLM), 표식에 의한 검색, 프리필터를 탄다. `ask` 함수는 요청을 보내고 응답에서 `message.content`만 꺼내 출력한다.

```bash
ask() {
  curl -s localhost:4100/v1/chat/completions \
    -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" -d "$1" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['choices'][0]['message']['content'])"
}
ask '{"model": "chat-small", "messages": [{"role": "user", "content": "광합성 원리를 단계별로 설명해줘"}]}'
ask '{"model": "chat-small", "messages": [{"role": "user", "content": "오늘 서울 날씨 알려줘"}], "tools": [{"type": "web_search"}]}'
ask '{"model": "chat-small", "messages": [{"role": "user", "content": "안녕"}]}'
```

세 답변 모두 mock 응답에 넣어 둔 연락처가 `[email]`, `[phone]`으로 바뀌어 나왔는지 본다.

```text
large 모델 답변입니다. 담당자 메일은 [email]입니다.
자세한 내용은 [email] 또는 [phone]로 문의하세요.
자세한 내용은 [email] 또는 [phone]로 문의하세요.
```

### 3. spend log의 decision trail 확인

응답만으로는 어느 훅이 어떤 판단을 내렸는지 알 수 없으므로, 방금 보낸 세 요청의 spend log 행에서 `model_group`과 `spend_logs_metadata`를 조회한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 3"
```

최신 행이 위에 오므로 아래에서 위로 광합성, 날씨, 인사 질문 순서다. 각 행의 `decisions` 목록에 훅 이름이 어떤 순서로 쌓였는지와, 질문 원문 대신 `question_chars`, `question_sha256`만 있는지를 본다.

```text
chat-small|{"decisions": [{"hook": "intent_router", "detail": "light via prefilter"}, {"hook": "response_masker", "detail": "masked 2"}], "question_chars": 2, "question_sha256": "e8f817f346d1d411"}
gateway-search|{"decisions": [{"hook": "intent_router", "detail": "heavy via llm"}, {"hook": "feature_switch", "detail": ["web_search"]}, {"hook": "search_provider", "detail": "searxng-backup -> chat-small"}, {"hook": "response_masker", "detail": "masked 2"}], "question_chars": 12, "question_sha256": "3877a16dd7a0e47c"}
chat-large|{"decisions": [{"hook": "intent_router", "detail": "heavy via llm"}, {"hook": "response_masker", "detail": "masked 1"}], "question_chars": 17, "question_sha256": "df689ae5a2d1a63a"}
```

날씨 질문의 행 하나에 네 단계가 순서대로 남았다. 의도 분류는 heavy였지만 표식이 `gateway-search`로 덮어썼고, 1순위 검색이 실패해 `searxng-backup`이 답했으며, 응답에서 연락처 2개를 가렸다. 마지막 `response_masker`의 기록까지 남았다는 것은 post_call 훅이 spend log 기록보다 먼저 실행된다는 뜻이다. 해시 값은 질문이 같으면 항상 같다. 광합성 질문의 `df689ae5a2d1a63a`가 6단계 Valkey 캐시 key `intent:df689ae5...`의 앞 16자와 같은 것도 그래서다. 6단계 key는 대소문자와 연속 공백을 정규화한 뒤 해시하므로, 그런 차이가 있는 질문에서만 두 값이 달라진다.

### 4. 원문이 남지 않았는지 확인

`spend_logs_metadata`에 원문이 없다고 해서 행의 다른 컬럼에도 없다는 보장은 없다. 그래서 방금 생긴 세 행 전체를 텍스트로 바꿔 질문과 응답의 일부를 찾는다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select count(*) filter (where row_to_json(s)::text like '%광합성%' or row_to_json(s)::text like '%날씨%' or row_to_json(s)::text like '%example.com%'), count(*)
   from (select * from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 3) s"
```

앞의 숫자가 원문 조각이 발견된 행 수, 뒤의 숫자가 검사한 전체 행 수다.

```text
0|3
```

세 행 어디에도 질문 원문과 응답의 이메일 도메인이 없고, `messages`, `response` 컬럼은 3단계에서 본 대로 `{}`다. 한편 `turn_off_message_logging`은 spend log가 아니라 로깅 콜백(외부 관측 도구 연동)에 넘기는 내용을 가리는 설정이다. 이 실습에는 외부 로깅 콜백이 없어 그 효과는 따로 확인하지 않았다.

### 5. 스트리밍 요청에서 post_call 훅 실행 여부 확인

2번에서는 모든 답변의 연락처가 가려졌지만, 그것은 비스트리밍 요청이었다. 같은 "안녕"을 OpenAI SDK로 스트리밍 요청해 청크를 이어 붙여 출력한다.

```bash
uv run python - <<'EOF'
from openai import OpenAI
client = OpenAI(base_url="http://localhost:4100", api_key="sk-local-master-key")
stream = client.chat.completions.create(model="chat-small", messages=[{"role": "user", "content": "안녕"}], stream=True)
print("".join(chunk.choices[0].delta.content or "" for chunk in stream))
EOF
```

연락처가 `[email]`, `[phone]`으로 바뀌었는지 본다.

```text
자세한 내용은 help@example.com 또는 010-1234-5678로 문의하세요.
```

이메일과 전화번호가 그대로 나왔다. 표식을 붙인 스트리밍 요청에서도 같은지 보려고 8단계의 스트림 측정 스크립트로 날씨 질문을 보낸다.

```bash
uv run python scripts/stream_timing.py chat-small "오늘 서울 날씨 알려줘" --web-search
```

이 요청의 spend log를 3번과 같은 방식으로 조회하면 `decisions` 목록에 `response_masker`가 없다.

```text
gateway-search|{"decisions": [{"hook": "intent_router", "detail": "heavy via cache"}, {"hook": "feature_switch", "detail": ["web_search"]}, {"hook": "search_provider", "detail": "searxng-backup -> chat-small"}], ...}
```

`async_post_call_success_hook`은 완성된 응답 객체를 받는 훅이라 스트리밍 경로에서는 호출되지 않는다. 스트림을 고치려면 `async_post_call_streaming_iterator_hook`을 따로 구현해야 하는데, 이메일 하나가 여러 청크에 나뉘어 올 수 있어 청크 단위 정규식으로는 놓친다. 따라서 응답 후처리를 보안 통제로 쓴다면, 스트리밍 경로를 막거나 별도로 구현하기 전까지는 통제라고 할 수 없다.

## 실습에서 걸린 함정: 한글과 정규식 경계

처음 쓴 정규식은 `[\w.+-]+@[\w-]+\.[\w.]+`와 `\b01\d-\d{3,4}-\d{4}\b`였다. 이 정규식으로 2번을 실행하면 이메일 뒤 문장이 잘리고 전화번호는 가려지지 않았다.

```text
large 모델 답변입니다. 담당자 메일은 [email]
자세한 내용은 [email] 또는 010-1234-5678로 문의하세요.
```

Python `re`에서 `\w`는 한글도 단어 문자로 본다. 그래서 이메일 정규식이 `owner@example.com입니다.`의 "입니다."까지 이메일로 삼켜 응답 문장이 잘렸고, 전화번호의 끝 `\b`는 "5678로"에서 숫자와 한글 사이를 경계로 보지 않아 매칭에 실패했다. 이메일은 ASCII 문자 집합으로, 전화번호는 숫자 기준 lookaround(`(?<!\d)`, `(?!\d)`)로 바꿔 해결했다. 한국어 텍스트를 다루는 마스킹 규칙은 조사가 붙은 문장으로 반드시 테스트해야 한다.

## 단위 테스트

[tests/test_11_decision_trail.py](../tests/test_11_decision_trail.py)는 decision trail의 순서, 한글 조사가 붙은 연락처 마스킹, post_call 훅의 응답 수정을 검증한다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_decisions_keep_execution_order_without_raw_question` | 훅과 provider의 기록이 실행 순서대로 쌓이고, 질문 원문은 어디에도 없다 |
| `test_mask_contacts_stops_at_korean_particles` | 조사가 붙은 이메일·전화번호를 조사는 남기고 가린다 |
| `test_post_call_hook_masks_response_and_records_count` | post_call 훅이 응답을 고치고 가린 개수를 남긴다 |

위 표의 세 테스트를 pytest로 실행한다.

```bash
uv run pytest tests/test_11_decision_trail.py
```

마지막 줄의 통과 개수가 표의 테스트 수와 같은지 본다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`ResponseMasker`에 `async_post_call_streaming_iterator_hook(self, user_api_key_dict, response, request_data)`를 추가해 스트림 청크의 `delta.content`를 가려 본다. 먼저 청크마다 `mask_contacts`를 적용해 위 5번 실행을 반복하고, mock 스트림이 `help@example.com`을 여러 청크로 나눠 보내기 때문에 일부가 가려지지 않는 것을 확인한다. 그다음 청크를 일정 길이만큼 모아 두었다가 가려서 내보내는 방식으로 바꾸고, 그 버퍼가 첫 토큰 지연을 얼마나 늘리는지 `scripts/stream_timing.py`로 잰다.
