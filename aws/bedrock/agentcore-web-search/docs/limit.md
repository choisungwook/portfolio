# 제한 사항

기준일은 2026년 8월 23일입니다. 리전, quota, preview 상태는 바뀔 수 있으므로 배포 전 공식 문서와 Service Quotas를 다시 확인합니다.

## 리전

AgentCore Web Search 지원 리전입니다.

- 미국 동부 버지니아 북부 `us-east-1`
- 유럽 아일랜드 `eu-west-1`
- 아시아 태평양 도쿄 `ap-northeast-1`

서울 `ap-northeast-2`는 지원하지 않습니다. 서울 workload에서 사용하면 리전 간 지연, data residency, data transfer, 장애 격리 기준을 함께 검토합니다.

Amazon Bedrock의 OpenAI GPT용 내장 Web Search도 서울 리전을 지원하지 않습니다. 해당 기능은 `us-east-1`, `us-east-2`, `us-west-2`에서 제공됩니다.

## Web Search 입력

| 항목 | 제한 |
| --- | --- |
| query 길이 | 최대 200자 |
| `maxResults` | 1~25 |
| connector | 이 실습은 `1.2.0` 고정 |
| target-level include domain | 최대 100개 |
| target-level exclude domain | 최대 100개 |
| request filter | domain include/exclude, 게시일 from/to |

include와 exclude를 함께 쓸 때 예상보다 결과가 줄어들 수 있습니다. 한국어 query를 받더라도 snippet 언어가 한국어로 보장되지는 않습니다.

## Quota와 payload

- Web Search 기본 요청 quota는 계정과 리전별로 확인합니다.
- Gateway tool call과 동시 요청 quota도 별도로 적용됩니다.
- Gateway payload 최대 크기는 6MB입니다.
- 429 응답에는 jitter가 포함된 exponential backoff를 사용합니다.
- 자동 재시도는 비용과 중복 검색을 늘리므로 횟수를 제한합니다.

```bash
aws service-quotas list-service-quotas \
  --service-code bedrock-agentcore \
  --region us-east-1
```

## LiteLLM

- AgentCore search provider는 2026년 8월 19일 병합되었습니다.
- 안정판 `v1.98.0` image에는 포함되지 않았습니다.
- 이 실습은 검증한 `1.99.0` image digest를 고정합니다.
- extra YAML credential parameter 대신 AWS 표준 credential chain을 사용합니다.
- OpenAI end-to-end 검색은 non-streaming부터 검증합니다.

## 사용 정책

- 검색 결과 URL과 title을 citation으로 유지합니다.
- 검색 결과를 대량 수집하거나 경쟁 검색 index를 만드는 용도로 사용하지 않습니다.
- connector가 유해 콘텐츠를 자동 차단한다고 가정하지 않습니다.
- domain filter는 의미 기반 안전 필터가 아닙니다.

## 참고 자료

- [Web Search Tool 제한](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html)
- [AgentCore 리전 확대](https://aws.amazon.com/about-aws/whats-new/2026/08/web-search-amazon-bedrock/)
- [Amazon Bedrock Web Search 리전](https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-bedrock-web/)
- [AgentCore Service Quotas](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)
