# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-09-20

* **Creation**: [LiteLLM custom pricing은 네 단가를 모두 적는다](decisions/2026-09-litellm-custom-pricing.md) 결정 기록. cache 단가만 지정했다가 input/output이 0으로 청구되는 것을 측정으로 확인해 남긴다.
* **Creation**: [버스트 트래픽 counter는 increase 대신 offset 차분으로 센다](decisions/2026-09-burst-counter-increase.md) 결정 기록. increase의 추정이 실제 요청 수와 어긋나는 것을 실측으로 확인해 남긴다.
* **Creation**: [LiteLLM 응답 캐시와 Bedrock prompt cache는 다른 것이다](topics/litellm-cache-vs-bedrock-prompt-cache.md) topic 기록. 같은 "캐시"를 섞어 쓰다 여러 턴을 왕복해서 남긴다.
* **Creation**: [LiteLLM 집계 엔드포인트별 캐시 노출 범위](topics/litellm-spend-endpoint-cache-coverage.md) topic 기록. spend 계열만 보고 잘못 단정했다가 정정받아 남긴다.
* **Creation**: [LiteLLM 과금 로직은 컨테이너 안 소스로 확인한다](playbooks/litellm-billing-source-reading.md) playbook 기록. 과금 질문마다 같은 네 파일을 반복해 읽어서 남긴다.
* **Update**: [LiteLLM custom pricing은 네 단가를 모두 적는다](decisions/2026-09-litellm-custom-pricing.md)에 적용 전 기본 가격표 대조 한 줄 추가.
