# 동작 원리와 Bedrock Web Search 비교

## AgentCore Web Search

AgentCore Web Search는 검색 결과를 직접 답변으로 만들지 않습니다. AgentCore Gateway의 MCP connector가 제목, URL, 스니펫, 게시일을 구조화해 돌려주고 애플리케이션의 모델이 이를 바탕으로 답변을 만듭니다.

```text
사용자 → LiteLLM 또는 직접 작성한 클라이언트 → AgentCore Gateway
      → Web Search connector → 구조화된 검색 결과 → 모델과 출처 표시
```

검색과 모델을 나누는 구조라 OpenAI뿐 아니라 다른 모델이나 agent framework에도 붙일 수 있습니다. 대신 검색 호출, 모델 호출, 출처 표시, 안전성 검사를 애플리케이션에서 책임집니다.

## 두 Web Search의 차이

| 구분 | AgentCore Web Search | Amazon Bedrock Web Search |
| --- | --- | --- |
| 발표 | 2026년 6월, 8월 19일 필터·리전 확대 | 2026년 8월 4일 |
| 호출 위치 | AgentCore Gateway의 MCP connector | Bedrock Responses API의 서버 도구 |
| 모델 | 모델·framework 독립적 | Bedrock의 OpenAI GPT-5.4, 5.5, 5.6 계열 |
| 결과 | 제목·URL·스니펫·게시일 | 모델 답변과 인용을 한 API에서 반환 |
| 지원 리전 | `us-east-1`, `eu-west-1`, `ap-northeast-1` | `us-east-1`, `us-east-2`, `us-west-2` |
| 검색 가격 | 1,000건당 7달러와 Gateway 호출료 | 1,000건당 12달러와 모델 토큰 비용 |
| 제어 | Gateway IAM, domain/date filter, MCP 조합 | 단일 Responses API 파라미터 |

참고한 서비스는 이름이 비슷하지만 호출 계층이 다릅니다. [AgentCore 발표 글](https://aws.amazon.com/ko/blogs/korea/announcing-web-search-on-amazon-bedrock-agentcore-ground-your-ai-agents-in-current-accurate-web-knowledge/)은 Gateway connector를 설명하고, [Bedrock Web Search 발표](https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-bedrock-web/)는 OpenAI 모델의 서버 도구를 설명합니다.

## 선택 기준

AgentCore Web Search가 잘 맞는 경우입니다.

- OpenAI API와 AWS 검색을 조합합니다.
- 모델이나 agent framework를 바꿀 가능성이 있습니다.
- 검색 결과를 별도 정책과 형식으로 가공합니다.
- Gateway IAM과 MCP를 공통 도구 계층으로 사용합니다.

Amazon Bedrock Web Search가 잘 맞는 경우입니다.

- 지원되는 OpenAI GPT 모델을 Bedrock에서 사용합니다.
- 검색 orchestration보다 한 번의 Responses API 호출이 중요합니다.
- 서버가 만든 답변과 인용을 그대로 활용합니다.

AgentCore 방식은 유연하고 검색 단가가 낮지만 구성 요소가 많습니다. Bedrock 방식은 단순하지만 모델과 리전 선택 폭이 좁고 검색 단가가 더 높습니다.

## 참고 자료

- [AgentCore Web Search 도구](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html)
- [AgentCore 1.2.0 필터와 리전 확대](https://aws.amazon.com/about-aws/whats-new/2026/08/web-search-amazon-bedrock/)
- [Amazon Bedrock Web Search 발표](https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-bedrock-web/)
