# 가격

2026년 8월 23일 공개 가격 기준입니다. 세금, 데이터 전송, CloudWatch, Guardrails 비용은 제외합니다.

## AgentCore 시나리오

검색 1건과 Gateway API 호출 1건을 가정합니다.

| 항목 | 공개 단가 | 한 건 비용 |
| --- | ---: | ---: |
| AgentCore Web Search | 1,000건당 7달러 | 0.007달러 |
| Gateway API invocation | 1,000건당 0.005달러 | 0.000005달러 |

기본 OpenAI 모델 `gpt-4.1-mini`는 100만 입력 토큰당 0.40달러, 출력 토큰당 1.60달러입니다. 입력 1,000 토큰과 출력 500 토큰을 가정합니다.

```text
모델 = (1,000 ÷ 1,000,000 × 0.40) + (500 ÷ 1,000,000 × 1.60)
     = 0.0012달러

합계 = AgentCore 0.007005 + 모델 0.0012
     = 약 0.008205달러
```

## Bedrock 내장 Web Search 시나리오

Web Search는 1,000건당 12달러입니다. `bedrock-mantle`의 GPT-5.6 Luna In-Region Standard 요금은 짧은 컨텍스트 기준으로 100만 입력 토큰당 0.22달러, 출력 토큰당 1.32달러입니다.

같은 토큰 사용량을 적용하면 다음과 같습니다.

```text
모델 = (1,000 ÷ 1,000,000 × 0.22) + (500 ÷ 1,000,000 × 1.32)
     = 0.00088달러

합계 = Web Search 0.012 + 모델 0.00088
     = 약 0.01288달러
```

실제 비용은 검색 횟수, 컨텍스트 길이, 캐시 사용량, 답변 길이에 따라 달라집니다. Gateway 로그, AWS Cost Explorer, OpenAI 사용량, 청구서를 기준으로 확인합니다.

## 추가 비용

- CloudWatch Logs 수집, 보존, Logs Insights query
- 리전 간 또는 인터넷 데이터 전송
- Guardrails 안전장치 사용량
- 재시도로 발생한 검색과 Gateway 호출

## 출처

- [AgentCore 가격](https://aws.amazon.com/bedrock/agentcore/pricing/)
- [Amazon Bedrock 가격](https://aws.amazon.com/bedrock/pricing/)
- [Amazon Bedrock GPT-5.6 Luna](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-luna.html)
- [GPT-4.1 mini 가격](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
