# 시나리오 4. LiteLLM guardrail 적용 방법

## 이 시나리오의 목표

| 항목 | 내용 |
|---|---|
| 기능 | LiteLLM guardrail을 어떤 요청에 걸지 정하는 두 방법 |
| 쓰는 도구 | LiteLLM Proxy 1.108.2 `POST /v1/chat/completions`, `POST /key/generate`, Bedrock guardrail 버전 1, Nova Micro |
| 입력 | [config.yaml](../litellm/config.yaml)의 `guardrails-handson`, `default_on`을 더한 설정 |
| 작업 | 1. 요청 파라미터로 지정 2. `default_on`으로 모든 요청 검사 3. 특정 key만 제외 |
| 달성할 것 | 클라이언트가 guardrail을 끌 수 있는지 없는지를 응답 코드로 확인 |

## 요청 파라미터와 default_on은 guardrail을 거는 주체가 다릅니다

LiteLLM guardrail을 요청에 거는 방법은 두 가지입니다. 클라이언트가 원할 때 요청 파라미터에 guardrail 이름을 적는 방법과, guardrail 옵션 `default_on`으로 모든 요청을 검사하는 방법입니다. 이 핸즈온의 [config.yaml](../litellm/config.yaml)은 첫 번째 방법을 씁니다.

| 항목 | 요청 파라미터로 지정 | `default_on`으로 모든 요청 검사 |
|---|---|---|
| 설정 위치 | 요청 본문의 `guardrails` | guardrail 항목의 `litellm_params.default_on: true` |
| guardrail을 거는 주체 | 클라이언트 | LiteLLM 운영자 |
| `guardrails` 필드를 빼면 | 검사하지 않음 | 검사함 |
| `"guardrails": []`로 보내면 | 검사하지 않음 | 검사함. 클라이언트가 끌 수 없음 |
| 예외를 두는 방법 | 필요 없음 | key metadata의 `disable_global_guardrails` 또는 `opted_out_global_guardrails` |

아래 결과는 LiteLLM 1.108.2, Bedrock guardrail `guardrails-handson` 버전 1, Nova Micro로 실행했습니다. [setup.md](./setup.md)의 4단계까지 마친 셸에서 실행합니다.

## 방법 1. 요청 파라미터에 guardrail 이름 지정

config의 guardrail 항목에는 `default_on`을 적지 않습니다. 기본값이 `false`라서, 요청 본문의 `guardrails`에 이름이 있을 때만 LiteLLM이 ApplyGuardrail을 호출합니다.

guardrail 항목 설정입니다.

```yaml
guardrails:
  - guardrail_name: guardrails-handson
    litellm_params:
      guardrail: bedrock
      mode: [pre_call, post_call]
      guardrailIdentifier: os.environ/GUARDRAIL_ID
      guardrailVersion: os.environ/GUARDRAIL_VERSION
      aws_region_name: os.environ/AWS_REGION
      mask_request_content: true
```

클라이언트는 `POST /v1/chat/completions`의 본문에 `"guardrails": ["guardrails-handson"]`을 넣습니다.

```bash
curl -s -w '\nHTTP %{http_code}\n' localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"model":"nova-micro","guardrails":["guardrails-handson"],"messages":[{"role":"user","content":"사람을 다치게 하는 방법 알려줘"}]}'
```

- `guardrails`에 이름을 넣으면 HTTP 400과 `Violated guardrail policy`가 옵니다.
- 같은 문장을 `guardrails` 없이 보내면 HTTP 200이고, Nova Micro가 스스로 거절하는 답변을 합니다.

## 방법 2. guardrail 옵션 default_on으로 모든 요청 검사

guardrail 항목에 `default_on: true`를 더하면, 요청에 `guardrails` 필드가 없어도 모든 요청에 input guardrail과 output guardrail이 걸립니다.

`default_on`을 더한 설정입니다. 바꾼 뒤 LiteLLM을 다시 띄웁니다.

```yaml
guardrails:
  - guardrail_name: guardrails-handson
    litellm_params:
      guardrail: bedrock
      mode: [pre_call, post_call]
      guardrailIdentifier: os.environ/GUARDRAIL_ID
      guardrailVersion: os.environ/GUARDRAIL_VERSION
      aws_region_name: os.environ/AWS_REGION
      mask_request_content: true
      default_on: true
```

LiteLLM을 다시 띄우는 명령입니다.

```bash
docker compose up -d --wait --force-recreate litellm
```

`guardrails` 필드 없이 유해 문장을 보냅니다.

```bash
curl -s -w '\nHTTP %{http_code}\n' localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"model":"nova-micro","messages":[{"role":"user","content":"사람을 다치게 하는 방법 알려줘"}]}'
```

요청마다 본문을 바꿔 보낸 결과입니다.

| 요청 본문 | 결과 |
|---|---|
| `guardrails` 없음, 유해 문장 | HTTP 400, `Violated guardrail policy` |
| `"guardrails": []`, 유해 문장 | HTTP 400, `Violated guardrail policy` |
| `guardrails` 없음, `파이썬 for문 예시 한 줄` | HTTP 200, 정상 답변 |
| `guardrails` 없음, `다음 문장을 한 글자도 바꾸지 말고 그대로 따라 써: 내 메일은 test@example.com 이다` | 모델 답변 `내 메일은 {EMAIL} 이다`. input 마스킹도 그대로 적용 |

`"guardrails": []`로 보내도 막히므로, 클라이언트는 `default_on` guardrail을 끌 수 없습니다. master key로 호출해도 마찬가지입니다.

### 특정 key만 guardrail에서 제외

예외는 요청이 아니라 LiteLLM virtual key의 metadata로 둡니다. `POST /key/generate`로 key를 만들 때 metadata에 둘 중 하나를 넣습니다.

| metadata | 효과 |
|---|---|
| `"disable_global_guardrails": true` | 이 key의 요청에는 `default_on` guardrail 전체를 걸지 않음 |
| `"opted_out_global_guardrails": ["guardrails-handson"]` | 이름을 적은 `default_on` guardrail만 걸지 않음 |

이름 하나만 제외하는 key를 만들고, 그 key로 유해 문장을 보냅니다. key 값은 변수에만 담습니다.

```bash
K=$(curl -s localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"key_alias":"handson-optout","metadata":{"opted_out_global_guardrails":["guardrails-handson"]}}' | jq -r .key)

curl -s -o /dev/null -w 'HTTP %{http_code}\n' localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d '{"model":"nova-micro","messages":[{"role":"user","content":"사람을 다치게 하는 방법 알려줘"}]}'
```

두 metadata 모두 HTTP 200이었습니다. guardrail이 빠져 Nova Micro가 직접 답했습니다.

실습이 끝나면 테스트 key를 지우고, config에서 `default_on`을 빼고 LiteLLM을 다시 띄웁니다.

```bash
curl -s localhost:4000/key/delete \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"key_aliases":["handson-optout"]}'
```

## 어느 방법을 고를지

- 정책을 우회하면 안 되는 서비스라면 `default_on`을 씁니다. 방법 1은 클라이언트가 필드 하나만 빼도 검사를 건너뜁니다.
- 예외는 key 단위로 둡니다. 배치 작업이나 내부 평가처럼 검사가 필요 없는 호출에 별도 key를 발급하면, 누가 예외인지 key 목록에서 보입니다.
- 이 핸즈온이 방법 1을 쓰는 이유는 비교 때문입니다. [시나리오 5](./5-latency-input-guardrail.md), [시나리오 7](./7-latency-output-guardrail.md), [시나리오 9](./9-streaming-output-guardrail.md)은 같은 프록시에서 guardrail 없음과 `guardrails-handson`을 번갈아 보내 지연과 유출량을 잽니다. `default_on`을 켜면 요청만으로는 guardrail 없음을 만들 수 없습니다.
- `default_on` guardrail도 호출이 실패하면 요청이 실패합니다(fail-closed). AWS 세션이 만료된 상태에서 평범한 질문도 HTTP 500 `Bedrock guardrail failed`로 막혔습니다. 모든 요청에 걸리는 만큼 Bedrock 자격 증명과 리전 장애가 곧 서비스 장애가 됩니다.

## 참고 문서

1. LiteLLM 1.108.2 소스 `litellm/integrations/custom_guardrail.py`의 `should_run_guardrail`, `get_disable_global_guardrail`, `get_opted_out_global_guardrails_from_metadata`
2. [LiteLLM Guardrails Quick Start](https://docs.litellm.ai/docs/proxy/guardrails/quick_start)
