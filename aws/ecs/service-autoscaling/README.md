# ECS Service Auto Scaling

ALB 뒤의 Fargate nginx service에 Application Auto Scaling target tracking(ALBRequestCountPerTarget)을 걸고, k6로 부하를 줘서 task 개수가 1 → 3 → 1로 바뀌는 과정과 scaling 알림을 확인하는 핸즈온입니다. Terraform과 nginx 설정은 [ECS Service desired count 핸즈온](../desired-count/)에서 가져왔습니다.

| 문서 | 내용 |
| --- | --- |
| [docs/setup.md](./docs/setup.md) | 환경 생성과 삭제 |
| [docs/1-concept.md](./docs/1-concept.md) | Auto Scaling에 필요한 세 가지, target tracking이 만드는 alarm, 알림 경로 |
| [docs/2-handson.md](./docs/2-handson.md) | 실습: 부하로 scale-out, 부하를 낮춰 scale-in, 이벤트와 알림 확인 |
| [docs/3-review.md](./docs/3-review.md) | 정리 질문과 답 |
| [docs/4-cpu-handson.md](./docs/4-cpu-handson.md) | CPU 시나리오: ECS Exec로 `yes`를 돌려 CPU target tracking scale-out |
