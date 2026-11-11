# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-11

* **Creation**: [isolated sandbox는 노드를 지키지만 SA 토큰과 Container Insights 메트릭은 그대로가 아니다](topics/sandbox-boundary-and-observability.md) 실측 기록. sandbox를 넣었다고 RBAC와 관측을 생략하지 않게 한다.
* **Update**: [EC2는 서울, EKS는 us-west-2 Auto Mode로 실습한다](decisions/2026-11-region-and-node-choice.md) 다음 과제 번호를 10으로 고침.
* **Creation**: [EC2는 서울, EKS는 us-west-2 Auto Mode로 실습한다](decisions/2026-11-region-and-node-choice.md) 결정 기록. EKS sandboxing이 US 리전만 지원해 리전을 나눈 이유를 남긴다.
* **Creation**: [저장소 terraform 기본값과 다르게 만든 부분](decisions/2026-11-terraform-rule-exceptions.md) 결정 기록. 다음 수정에서 default VPC나 t4g로 되돌리지 않게 한다.
* **Creation**: [Nitro Sandbox 메모리는 공식대로 MiB 단위까지 빠진다](topics/nitro-sandbox-memory-accounting.md) 실측 기록. 용량 계획 공식을 검증한 값을 남긴다.
