# ECS Service desired count

ECS Service의 desiredCount, runningCount, pendingCount 차이를 콘솔, CLI, Terraform으로 확인하는 핸즈온입니다. ALB 뒤의 Fargate nginx task 개수를 1 → 3 → 2로 바꾸고, task를 강제로 멈춰 service scheduler의 복구를 봅니다.

| 문서 | 내용 |
| --- | --- |
| [docs/setup.md](./docs/setup.md) | 환경 생성과 삭제 |
| [docs/1-concept.md](./docs/1-concept.md) | desired, running, pending과 두 health check, Kubernetes 대응표 |
| [docs/2-handson.md](./docs/2-handson.md) | 실습 8단계: desired count 변경, drift, self-healing, 이벤트 이력 |
| [docs/3-review.md](./docs/3-review.md) | 정리 질문과 답 |
