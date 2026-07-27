# 이벤트 사전 용량 점검 — 스케일 판단과 warm pool

"다음 주 이벤트로 트래픽 10배가 예상된다. 인스턴스와 DB 스펙을 미리 점검하라"는 인터뷰 질문을 정리한 자료다. 대상 구조는 EC2(Auto Scaling Group) + internet-facing ALB + Spring Boot API + Redis + RDS다.

"CPU 여유 있어 보임"이 아니라 근거 있는 점검을 목표로 한다. Google SRE book의 4 golden signals에서 saturation을 축으로 잡고, 계층별(ALB, ASG/EC2, Spring Boot, Redis, RDS) 포화 지점을 실측한 뒤, 병목마다 "요청을 나누면 병목도 나뉘는가"라는 질문으로 scale up/out을 판단한다. scale out의 시간 벽을 줄이는 warm pool과, 시각을 아는 부하를 미리 채우는 scheduled scaling까지 다룬다.

## 어디부터 볼 것인가

학습지 [studysheet-event-capacity-review-v1.html](./studysheet-event-capacity-review-v1.html)이 본문이다. 브라우저로 열어 페이지를 넘기며 읽는다. 외부 라이브러리 없이 파일 하나로 동작한다.

| 단계 | 내용 | 자료 |
|---|---|---|
| 1 | 문제 정의와 점검의 네 축 | [docs/1-problem.md](./docs/1-problem.md) |
| 2 | 로컬에서 세 가지 병목을 메트릭으로 구분 | [docs/2-handson.md](./docs/2-handson.md) |
| 3 | AWS에서 warm pool이 아끼는 시간 실측 | [docs/3-warmpool.md](./docs/3-warmpool.md) |
| 4 | 정리 | [docs/4-cleanup.md](./docs/4-cleanup.md) |

## 실습 두 개

**로컬 병목 구분 실습** — docker compose로 MySQL, Valkey, Spring Boot 앱을 띄우고 k6로 부하를 건다. 앱은 병목이 다른 endpoint 세 개를 노출한다. /api/db는 Hikari pool이, /api/cpu는 CPU가, /api/product는 캐시 TTL 만료 순간의 miss 폭풍이 병목이 된다. p95 폭증이라는 같은 증상이 메트릭으로는 어떻게 다르게 보이는지, 그리고 어느 쪽이 scale out으로 풀리는지를 눈으로 확인한다. Tomcat thread 20, Hikari pool 5, CPU 1개로 일부러 작게 잡아 2분 램프 안에 포화가 보인다.

**warm pool 실습** — terraform으로 ALB + ASG(t4g.small) + Stopped warm pool + CPU target tracking + scheduled action을 만든다. warm pool에서 꺼내는 scale out과 cold launch의 InService 도달 시간을 비교하고, Stopped 풀에서 나온 인스턴스의 JVM은 여전히 cold라는 한계도 확인한다.

## 디렉터리

| 경로 | 설명 |
|---|---|
| `docs/` | 실습 순서와 각 단계에서 볼 것 |
| `app/` | 병목 세 종류를 재현하는 Spring Boot API (actuator prometheus 노출) |
| `k6/` | 부하 램프 스크립트. TARGET 환경변수로 endpoint 선택 |
| `compose.yaml` | MySQL + Valkey + 앱 + k6(load profile) |
| `terraform/` | ALB, ASG, warm pool, target tracking, scheduled action |
