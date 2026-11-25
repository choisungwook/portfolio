# DB 커넥션풀 크기 조절 핸즈온 (설계)

HikariCP가 커넥션을 언제 늘리고 언제 줄이는지, 그 판단 기준을 설정 키와 관측 지표로 확인하는 핸즈온입니다. 이론과 실습 설계까지만 있고, 실습 출력은 예상값입니다.

## 문서

| 번호 | 문서 |
| --- | --- |
| 0 | [실습 환경 준비](./docs/setup.md), [구현 명세](./docs/implementation-spec.md) |
| 1 | [기능 지도: 커넥션풀에는 desired가 없다](./docs/1-feature-map.md) |
| 2 | [고정 풀: HikariCP 기본값은 처음부터 max개를 연다](./docs/2-fixed-pool.md) |
| 3 | [수요에 따른 증가: 풀은 기다리는 스레드를 보고 하나씩 늘린다](./docs/3-grow-on-demand.md) |
| 4 | [상한 대기와 타임아웃: max를 넘는 요청은 기다리거나 실패한다](./docs/4-max-and-timeout.md) |
| 5 | [유휴 축소와 수명 교체: 줄어드는 시점은 타이머와 housekeeper가 정한다](./docs/5-shrink-and-lifetime.md) |
| 부록 A | [PgBouncer: min, default, reserve로 나뉜 프록시 풀](./docs/appendix-a-pgbouncer.md) |
