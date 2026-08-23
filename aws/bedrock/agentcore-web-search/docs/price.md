# 가격

가격은 2026년 8월 23일 공개 가격 기준이며 세금, 데이터 전송, CloudWatch, 환율은 제외합니다.

## AgentCore Web Search 한 건

| 항목 | 공개 단가 | 한 건 비용 |
| --- | ---: | ---: |
| Web Search query | 1,000건당 7달러 | 0.007달러 |
| Gateway API invocation | 1,000건당 0.005달러 | 0.000005달러 |

LiteLLM `/search`는 알려진 tool 이름으로 `tools/call` 한 번을 보내므로 한 건은 약 `0.007005달러`입니다.

직접 호출 예제는 `tools/list`와 `tools/call`을 한 번씩 사용합니다.

```text
0.007 + (2 × 0.000005) = 0.007010달러
```

tool 목록을 애플리케이션에서 안전하게 cache하면 이후 검색은 `0.007005달러`에 가까워집니다. 실제 청구는 AWS Cost Explorer와 청구서를 기준으로 확인합니다.

## OpenAI 모델을 포함한 예시

기본 모델 `gpt-4.1-mini`는 100만 input token당 0.40달러, output token당 1.60달러입니다. input 1,000 token과 output 500 token을 가정합니다.

```text
OpenAI = (1,000 ÷ 1,000,000 × 0.40) + (500 ÷ 1,000,000 × 1.60)
       = 0.0012달러

LiteLLM 시나리오 한 건 = AgentCore 0.007005 + OpenAI 0.0012
                       = 약 0.008205달러
```

검색 스니펫 길이와 답변 길이에 따라 token 비용이 달라집니다. OpenAI model을 바꾸면 해당 model의 최신 가격으로 다시 계산합니다.

## Bedrock 내장 Web Search와 비교

Amazon Bedrock의 OpenAI GPT용 내장 Web Search는 1,000 query당 12달러, 한 건당 0.012달러입니다. 여기에 Bedrock model token 비용이 추가됩니다.

## 추가 비용

- CloudWatch Logs 수집, 보존, Logs Insights query
- 리전 간 또는 인터넷 data transfer
- Guardrails의 safeguard 사용량
- 재시도로 발생한 Web Search와 Gateway 호출

## 출처

- [AgentCore 가격](https://aws.amazon.com/bedrock/agentcore/pricing/)
- [Amazon Bedrock 가격](https://aws.amazon.com/bedrock/pricing/)
- [GPT-4.1 mini 가격](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
