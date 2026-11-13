# 4단계. 키워드 규칙으로 모델을 바꾸는 훅

## 이번 단계에서 배울 개념

- pre_call 훅에서 `data["model"]`을 바꾸면 Router는 바뀐 별칭으로 deployment를 고른다. 클라이언트 코드는 그대로 `chat-small`을 부르는데 gateway가 질문 내용을 보고 `chat-large`로 보낸다.
- 응답 본문의 `model`은 훅이 바꾸기 **전**에 클라이언트가 보낸 값으로 찍힌다. 교체가 일어났는지는 응답 헤더 `x-litellm-model-group`이나 spend log로만 보인다.
- 문자열 포함 규칙은 빠르고 비용이 없지만, 의미가 아니라 글자를 보기 때문에 거짓 양성(가벼운 질문을 무겁게 판단)과 거짓 음성(무거운 질문을 놓침)이 반드시 생긴다.

Q&A 챗봇에서 "코드", "분석", "비교", "설계"가 들어간 질문은 큰 모델이 답하게 하고, 나머지는 작은 모델에 둔다는 규칙을 가정한다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| 모델 교체 | 훅이 요청의 `model` 필드를 다른 별칭으로 바꾸는 것 | `chat-small` → `chat-large` |
| 거짓 양성 (False Positive) | 규칙이 걸렸지만 실제로는 걸리지 말았어야 하는 경우 | "코드명 프로젝트가 뭐야?" |
| 거짓 음성 (False Negative) | 걸렸어야 하는데 규칙이 놓친 경우 | "이 두 설명의 차이점을 알려줘" |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | 훅 실행 전에 클라이언트가 보낸 `model`을 따로 저장한다 | `proxy/common_request_processing.py` | `ProxyBaseLLMRequestProcessing.base_process_llm_request` (`requested_model_from_client`) |
| 2 | pre_call 훅 체인을 실행하고, 반환된 dict로 `self.data`를 교체한다 | `proxy/common_request_processing.py` → `proxy/utils.py` | `common_processing_pre_call_logic` → `ProxyLogging.pre_call_hook` |
| 3 | 바뀐 `data["model"]`로 Router를 부른다 | `proxy/route_llm_request.py` | `route_request` |
| 4 | 응답 본문 `model`을 1번에서 저장한 값으로 덮어쓴다 | `proxy/common_request_processing.py` | `_override_openai_response_model` |

1번과 4번 때문에 클라이언트 입장에서는 교체가 투명하다. 클라이언트 호환성에는 좋지만, 운영자가 "왜 이 요청의 비용이 큰가"를 추적할 때 본문만 보면 원인을 찾을 수 없다. 그래서 훅이 교체 사유를 `spend_logs_metadata`에 함께 남긴다.

## 코드와 config

[gateway/keyword_router.py](../gateway/keyword_router.py)의 핵심은 마지막 user 메시지를 꺼내 키워드를 찾는 두 함수와, 찾았을 때만 model을 바꾸는 훅이다. content가 문자열이 아니라 `[{"type": "text", ...}]` 목록으로 오는 OpenAI 형식도 처리한다.

```python
HEAVY_KEYWORDS = ("코드", "분석", "비교", "설계")
HEAVY_MODEL = "chat-large"


class KeywordRouter(CustomLogger):
  async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type) -> dict:
    keyword = find_keyword(last_user_text(data.get("messages", [])))
    if keyword is None:
      return data
    requested = data.get("model")
    data["model"] = HEAVY_MODEL
    return add_spend_logs_metadata(data, {"keyword_router": f"{requested}->{HEAVY_MODEL} ({keyword})"})
```

`add_spend_logs_metadata`는 3단계에서 만든 함수를 재사용한다. [config/4-keyword-router.yaml](../config/4-keyword-router.yaml)은 별칭 2개와 이 훅 하나만 등록한다.

## 실행

### 1. Proxy 기동

Postgres가 떠 있어야 한다([1-setup.md의 4번](1-setup.md)). 그 위에서 별칭 2개와 `KeywordRouter` 훅을 등록한 config로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/4-keyword-router.yaml --port 4100
```

### 2. 질문 4개를 모두 chat-small로 요청

키워드가 들어간 질문, 키워드가 없는 가벼운 질문, 그리고 거짓 양성과 거짓 음성을 만드는 질문을 모두 `chat-small`로 보낸다. 반복문은 질문마다 본문의 `model`과 응답 내용, 응답 헤더의 `x-litellm-model-group`을 출력한다.

```bash
for q in "파이썬 코드 리뷰해줘" "오늘 날씨 어때?" "코드명 프로젝트가 뭐야?" "이 두 설명의 차이점을 알려줘"; do
  echo "Q: $q"
  curl -s -D /tmp/h.txt localhost:4100/v1/chat/completions \
    -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
    -d "{\"model\": \"chat-small\", \"messages\": [{\"role\": \"user\", \"content\": \"$q\"}]}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['model'], '|', d['choices'][0]['message']['content'])"
  grep -i x-litellm-model-group /tmp/h.txt
done
```

질문마다 본문의 `model`과 헤더의 `x-litellm-model-group`을 비교한다.

```text
Q: 파이썬 코드 리뷰해줘
chat-small | large 모델의 mock 응답입니다.
x-litellm-model-group: chat-large
Q: 오늘 날씨 어때?
chat-small | small 모델의 mock 응답입니다.
x-litellm-model-group: chat-small
Q: 코드명 프로젝트가 뭐야?
chat-small | large 모델의 mock 응답입니다.
x-litellm-model-group: chat-large
Q: 이 두 설명의 차이점을 알려줘
chat-small | small 모델의 mock 응답입니다.
x-litellm-model-group: chat-small
```

본문 `model`은 네 번 모두 `chat-small`이라서, 실제로 답한 별칭은 헤더와 응답 내용에서만 드러난다. 세 번째 질문은 거짓 양성이다. "코드명"에 "코드"가 들어 있어 큰 모델로 갔다. 네 번째 질문은 거짓 음성이다. 두 설명을 비교하는 무거운 질문이지만 "비교"라는 글자가 없어 작은 모델에 남았다.

### 3. spend log에 남은 교체 사유 확인

본문만으로는 교체 여부를 알 수 없으므로, 훅이 남긴 교체 사유를 보려고 최근 spend log 4행을 조회한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select left(request_id,20), model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 4"
```

`model_group`과 마지막 칸의 교체 사유를 함께 본다.

```text
chatcmpl-8b9b52bb-a3|chat-small|null
chatcmpl-0561a7cc-e0|chat-large|{"keyword_router": "chat-small->chat-large (코드)"}
chatcmpl-a1209614-7b|chat-small|null
chatcmpl-1e7eecb4-d9|chat-large|{"keyword_router": "chat-small->chat-large (코드)"}
```

훅이 아무것도 바꾸지 않은 요청은 `spend_logs_metadata`가 `null`이다. 판단하지 않은 것과 판단 결과 "그대로 둠"을 구분하려면 교체하지 않을 때도 값을 남겨야 한다. 11단계에서 이 구분을 넣는다.

## 거짓 양성과 거짓 음성의 Trade-off

키워드 목록을 넓히면 거짓 음성이 줄고 거짓 양성이 늘어난다. "차이"를 추가하면 네 번째 질문은 잡히지만 "시차가 몇 시간이야?" 같은 가벼운 질문도 큰 모델로 간다. 반대로 단어 경계를 엄격히 보면(예: 형태소 분석) 거짓 양성이 줄지만 규칙 코드가 커지고, 결국 "무거운 질문"이라는 의미를 글자 규칙으로 근사한다는 한계는 그대로다.

어느 쪽 오류가 더 비싼지가 판단 기준이다. 이 챗봇에서 거짓 양성의 비용은 큰 모델 요금과 지연이고, 거짓 음성의 비용은 작은 모델이 무거운 질문에 부실하게 답하는 품질 저하다. 요금이 문제라면 키워드를 좁게, 품질이 문제라면 넓게 잡는다. 6단계는 이 Trade-off를 규칙 하나로 정하지 않고, 규칙이 확신할 때만 규칙을 쓰고 애매하면 작은 LLM에 묻는 구조로 바꾼다.

## 단위 테스트

[tests/test_4_keyword_router.py](../tests/test_4_keyword_router.py)는 실행 결과에서 본 세 가지 경우를 고정한다. 거짓 양성과 거짓 음성도 "현재 규칙의 동작"으로 테스트에 남겨, 규칙을 고칠 때 의도적으로 바꿨는지 드러나게 한다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_keyword_switches_to_large_model_and_records_reason` | 키워드가 있으면 `chat-large`로 바뀌고 사유가 남는다 |
| `test_question_without_keyword_keeps_model` | content 목록 형식에서도 동작하며, 키워드가 없으면 그대로 둔다(거짓 음성) |
| `test_substring_match_causes_false_positive` | 부분 문자열 일치로 거짓 양성이 생긴다 |

아래 명령은 이 테스트 파일만 실행한다.

```bash
uv run pytest tests/test_4_keyword_router.py
```

마지막 줄에서 세 테스트가 모두 통과했는지 본다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`HEAVY_KEYWORDS`에 "차이"를 추가하고 위 4개 질문에 "시차가 몇 시간이야?"를 더해 다시 보낸다. 거짓 음성 하나가 사라지는 대신 어떤 거짓 양성이 새로 생기는지 세어 보고, 테스트 3개 중 어느 것이 깨지는지 확인한다.
