# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-09-20

* **Creation**: [LiteLLM custom pricing은 네 단가를 모두 적는다](decisions/2026-09-litellm-custom-pricing.md) 결정 기록. cache 단가만 지정했다가 input/output이 0으로 청구되는 것을 측정으로 확인해 남긴다.
* **Creation**: [버스트 트래픽 counter는 increase 대신 offset 차분으로 센다](decisions/2026-09-burst-counter-increase.md) 결정 기록. increase의 추정이 실제 요청 수와 어긋나는 것을 실측으로 확인해 남긴다.
