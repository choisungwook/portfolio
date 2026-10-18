# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-10-18

* **Creation**: [circuit breaker의 FAILED 선언은 임계치 도달 직후가 아니라 다음 태스크 실행 뒤에 온다](topics/circuit-breaker-detection-delay.md) 통찰 기록. 두 번 실측한 감지 지연과 파이프라인 timeout 주의를 남긴다.
* **Update**: [revision과 circuit breaker는 콘솔이 소유하고 Terraform은 ignore_changes한다](decisions/2026-10-console-owned-circuit-breaker.md)에 실측 근거 추가. 첫 배포 뒤 프로덕션이 green이어도 plan에 drift가 없다는 것과 enable=false가 rollback을 false로 저장한다는 것.
* **Creation**: [revision과 circuit breaker는 콘솔이 소유하고 Terraform은 ignore_changes한다](decisions/2026-10-console-owned-circuit-breaker.md) 결정 기록. provider가 임계치 설정을 지원하지 않아 CLI로 바꾸는 이유를 남긴다.
