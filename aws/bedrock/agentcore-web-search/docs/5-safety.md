# 유해 검색 대응

Web Search connector는 정보 검색 도구이며 유해한 의도를 의미적으로 차단하지 않습니다. 현재 예제의 `scripts/litellm_safety_probe.sh`도 차단 기능이 아니라 검색 결과가 반환될 수 있음을 확인하는 검사입니다.

## 권장 흐름

```text
사용자 질의
  → Bedrock ApplyGuardrail INPUT 검사
  → 허용된 질의만 Web Search
  → 검색 결과 ApplyGuardrail OUTPUT 검사
  → 모델 안전 정책과 출처 검증
  → 사용자 응답
```

## 검색 전 차단

- Bedrock Guardrails의 content filter와 denied topic 구성
- `ApplyGuardrail` API의 `source=INPUT`으로 검색 질의 검사
- `GUARDRAIL_INTERVENED`이면 Web Search 호출 중단
- 차단 응답에서 검색 결과와 변형된 유해 키워드 제외

## 검색 범위 제한

- `.env`의 `WEB_SEARCH_INCLUDED_DOMAINS_JSON`으로 신뢰할 수 있는 출처만 허용
- 필요하면 connector `1.2.0`의 request-level domain/date filter 적용
- domain allowlist를 유해성 판정 수단으로 사용하지 않음

## 검색 후 차단

- 제목과 스니펫을 `ApplyGuardrail`의 `source=OUTPUT`으로 검사
- 차단된 검색 결과를 모델 context에서 제외
- 통과한 URL과 제목만 인용 metadata로 유지

## 회귀 테스트

- 한국어, 영어, 우회 표현을 분리해 검사
- 결과 본문 대신 `blocked`, `results_returned`, 결과 개수만 저장
- Guardrail 정책 변경 후 같은 corpus로 재검증
- 차단 실패율과 `GUARDRAIL_INTERVENED` 비율에 경보 설정

## 운영 시 주의

CloudWatch Gateway 로그에는 요청과 응답 본문이 포함될 수 있습니다. 민감정보 마스킹, 짧은 보존 기간, 로그 접근 권한 분리를 적용합니다.

## 참고 자료

- [ApplyGuardrail API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ApplyGuardrail.html)
- [Bedrock Guardrails 독립 적용](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-independent-api.html)
- [Web Search domain과 date filter](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html)
