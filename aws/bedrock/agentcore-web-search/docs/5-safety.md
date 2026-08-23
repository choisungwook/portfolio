# 유해 검색 대응

## 확인 결과

2026년 8월 23일에 LiteLLM 경로와 직접 호출 경로를 각각 확인했습니다. 두 경로 모두 유해한 제작 방법을 묻는 한국어 질의에 검색 결과 3건을 반환했습니다.

이 결과는 connector 장애가 아닙니다. Web Search는 정보 검색 도구이며 모든 유해 의도를 의미적으로 차단한다고 보장하지 않습니다.

## 권장 흐름

```text
사용자 질의
  → Bedrock ApplyGuardrail INPUT 검사
  → 허용된 질의만 Web Search
  → 검색 스니펫 ApplyGuardrail OUTPUT 검사
  → 모델 안전 정책과 출처 검증
  → 사용자 응답
```

### 1. 검색 전 차단

- Bedrock Guardrails의 content filter와 denied topic을 구성합니다.
- `ApplyGuardrail` API의 `source=INPUT`으로 검색 질의를 먼저 검사합니다.
- `GUARDRAIL_INTERVENED`이면 Web Search를 호출하지 않습니다.
- 차단 응답에는 검색 결과나 변형된 유해 키워드를 포함하지 않습니다.

### 2. 검색 범위 제한

- 신뢰할 수 있는 자료만 필요하면 Terraform의 `included_domains`를 사용합니다.
- connector `1.2.0`의 request-level domain/date filter도 함께 적용합니다.
- domain allowlist는 출처 통제이며 유해 의미 판정의 대체물이 아닙니다.

### 3. 검색 후 차단

- 제목과 스니펫을 합친 텍스트를 `ApplyGuardrail`의 `source=OUTPUT`으로 검사합니다.
- 차단된 검색 결과는 모델 context에 넣지 않습니다.
- 통과한 URL과 제목만 citation metadata로 유지합니다.

### 4. 회귀 테스트

- 한국어, 영어, 우회 표현을 분리해 테스트합니다.
- 결과 본문 대신 `blocked`, `results_returned`, result count만 저장합니다.
- Guardrail 정책 변경 후 같은 corpus로 재검증합니다.
- 차단 실패율과 `GUARDRAIL_INTERVENED` 비율에 경보를 둡니다.

## 운영 시 주의

CloudWatch Gateway 로그에는 요청과 응답 본문이 포함될 수 있습니다. 민감정보 마스킹, 짧은 보존 기간, 로그 접근 권한 분리를 적용합니다.

## 참고 자료

- [ApplyGuardrail API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ApplyGuardrail.html)
- [Bedrock Guardrails 독립 적용](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-independent-api.html)
- [Web Search domain과 date filter](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html)
