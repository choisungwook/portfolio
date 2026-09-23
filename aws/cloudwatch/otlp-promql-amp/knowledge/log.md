# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-09-23

* **Update**: [컨테이너에 로컬 자격 증명을 넣지 않고 컴포넌트마다 IAM role을 둔다](decisions/2026-09-iam-role-per-component.md) Grafana를 `grafana` 변수 하나로 고르게 바꾼 내용 반영.

* **Creation**: [컨테이너에 로컬 자격 증명을 넣지 않고 컴포넌트마다 IAM role을 둔다](decisions/2026-09-iam-role-per-component.md) 로컬 profile mount 구성을 버린 이유와 AMG token·license 제약.
* **Creation**: [같은 Prometheus metric이 CloudWatch OTLP와 AMP에서 다른 모양으로 저장된다](topics/cloudwatch-otlp-vs-amp-data-shape.md) 실측으로 확인한 label·histogram·시작 시각 차이.
