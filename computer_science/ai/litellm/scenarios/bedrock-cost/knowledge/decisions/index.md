# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [LiteLLM custom pricing은 네 단가를 모두 적는다](2026-09-litellm-custom-pricing.md) - 단가를 하나라도 주면 기본 가격표와 병합되지 않아 빠뜨린 항목이 0으로 청구된다.
* [버스트 트래픽 counter는 increase 대신 offset 차분으로 센다](2026-09-burst-counter-increase.md) - 요청이 몇 초 안에 몰리면 increase의 추정값이 실제 건수와 어긋난다.
