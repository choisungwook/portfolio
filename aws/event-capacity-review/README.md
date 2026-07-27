# 이벤트 전 인스턴스와 DB 스펙 점검

이벤트를 앞두고 "지금 스펙으로 버티는가, 아니면 무엇을 얼마나 올리는가"에 답하는 방법을 정리한 핸즈온이다. 대상 구조는 internet-facing ALB → EC2 Auto Scaling group(Spring Boot API) → ElastiCache Redis → RDS다.

핵심 판단은 하나다. 병목이 인스턴스마다 따로 있으면 scale out, 모든 인스턴스가 공유하는 자원에 있으면 scale up이다. 공유 병목 앞에서 scale out을 하면 커넥션만 늘어 상황이 나빠지는데, 로컬 실습에서 이 현상을 수치로 확인한다.

학습지: [studysheet-event-capacity-review.html](./studysheet-event-capacity-review.html)

문서는 실행 순서대로 읽는다.

1. [점검이 답해야 하는 질문](./docs/1-problem.md)
2. [계층별 점검 항목과 scale up/out 기준](./docs/2-review-checklist.md)
3. [실습: 한계를 직접 측정](./docs/3-handson.md)
4. [Warm pool 판단 기준](./docs/4-warm-pool.md)

실습 환경 준비는 [setup.md](./docs/setup.md)를 따른다. Docker와 AWS 계정 없이 JVM 두 개로 돌아간다.
