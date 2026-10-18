# ECS circuit breaker (blue/green)

nginx 1대짜리 Fargate 서비스를 ECS blue/green으로 배포하면서 deployment circuit breaker의 1단계 실패(이미지 pull), 2단계 실패(컨테이너 health check), 미사용 동작을 콘솔에서 비교하는 핸즈온입니다. 인프라와 태스크 정의 revision 3개는 Terraform으로 미리 만들고, 배포와 circuit breaker 설정은 콘솔에서 바꿉니다.

| 문서 | 내용 |
| --- | --- |
| [docs/setup.md](./docs/setup.md) | 환경 생성과 삭제 |
| [docs/1-concept.md](./docs/1-concept.md) | 실패 2단계, 임계치 계산, enable과 rollback, blue/green에서 트래픽이 움직이는 시점 |
| [docs/2-handson.md](./docs/2-handson.md) | 실습: 이미지 pull 실패, health check 실패, circuit breaker 끄기 |
| [docs/3-review.md](./docs/3-review.md) | 확인 질문과 답 |
