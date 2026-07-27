# 비대칭 라우팅 (asymmetric routing)

TL;DR: 가는 길과 오는 길은 서로 다른 라우팅 테이블이 따로 정하므로 비대칭은 고장이 아니다. 고장은 두 경로 중 한쪽에만 상태를 기억하는 장비(conntrack, NAT, rp_filter, 클라우드 출발지 검사)가 있을 때 생긴다. 로컬은 컨테이너 네 개로 재현하고, AWS는 private NAT gateway로 오는 길을 확정하는 실습을 한다.

## 학습지

* [studysheet-asymmetric-routing.html](./studysheet-asymmetric-routing.html) - 이론과 실습 결과를 슬라이드로 정리. 브라우저로 연다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-setup-local.md](./docs/1-setup-local.md) | 로컬 실습 환경 up과 down |
| [2-local-handson.md](./docs/2-local-handson.md) | 비대칭을 만들고 rp_filter와 stateful 방화벽으로 하나씩 깨뜨리는 실습 |
| [3-setup-aws.md](./docs/3-setup-aws.md) | AWS 실습 환경 apply와 destroy, 비용 |
| [4-aws-handson.md](./docs/4-aws-handson.md) | 다중 ENI 출발지 검사, 없는 오는 길, private NAT gateway로 해결 |

## 실습 파일

| 경로 | 내용 |
|---|---|
| [compose.yaml](./compose.yaml) | client, r1, r2, server 컨테이너와 세 개의 네트워크 |
| [scripts/](./scripts/) | 컨테이너 안에서 실행하는 경로, rp_filter, 방화벽 전환 스크립트 |
| [probe.sh](./probe.sh) | 요청 한 번을 보내면서 두 라우터를 동시에 캡처하는 호스트 측 헬퍼 |
| [terraform/](./terraform/) | VPC 두 개, peering, private NAT gateway, EC2 세 대 |
