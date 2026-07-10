# AWS ElastiCache 인증 무중단 전환

TLS만 켜진 ElastiCache Valkey에 인증을 단계별로 추가하는 핸즈온이다. 무인증 → AUTH token → RBAC → IAM 전용으로 넘어가되, 현재 트래픽을 받는 앱의 Redis 오류를 0건으로 유지한다.

앱은 인증 방식별로 세 이미지(`noauth`/`auth`/`iam`)로 나뉘고, EC2 한 대 안의 Docker 컨테이너로 pod을 대체한다. Hurl은 EC2 안에서 전환 중 cache 오류를 감시한다.

실행 순서대로 읽는다.

1. [운영 시나리오와 무중단 기준](./docs/1-scenario.md)
2. [인증 개념과 전환 제약](./docs/2-concepts.md)
3. [준비: 인프라와 무인증 컨테이너](./docs/3-setup.md)
4. [AUTH token 강제](./docs/4-auth-token.md)
5. [RBAC 전환과 IAM 전용](./docs/5-rbac-iam.md)

4·5단계의 클러스터 변경을 Terraform 대신 AWS 콘솔·CLI로 하려면 [부록: AWS 콘솔과 CLI로 인증 전환](./docs/6-console-runbook.md)을 본다.
