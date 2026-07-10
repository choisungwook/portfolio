---
type: Decision
title: ElastiCache는 Valkey 엔진과 RBAC + IAM 인증을 기본으로 한다
description: 새로 만드는 ElastiCache는 Redis 대신 Valkey를 쓰고, AUTH token 단독 대신 RBAC user group과 IAM 인증을 기본으로 구성한다.
tags: [aws, elasticache, valkey, terraform, security]
timestamp: 2026-07-11T00:00:00Z
---

## 결정

앞으로 ElastiCache를 만들 때 엔진은 Valkey를 쓰고, 인증은 RBAC user group과 IAM 인증을 기본으로 한다. AUTH token 단독 방식은 새 클러스터에 쓰지 않는다.

- 엔진: `engine = "valkey"`, 최소 Valkey 7.2. 이 버전부터 AUTH token, RBAC, IAM 인증이 모두 된다.
- 인증: `aws_elasticache_user`(IAM)와 `aws_elasticache_user_group`을 만들어 replication group의 `user_group_ids`에 붙인다. IAM user는 `user_id`와 `user_name`이 같아야 한다.
- 접속 주체의 IAM role에 replication group ARN과 user ARN을 대상으로 `elasticache:Connect` 권한을 준다.
- 전송 중 암호화(`transit_encryption_mode = "required"`)와 저장 시 암호화를 항상 켠다.

구체 HCL 패턴은 [.claude/rules/terraform.md](../../.claude/rules/terraform.md)의 ElastiCache 규칙에 있다.

## 이유

- Redis는 라이선스가 RSALv2/SSPL로 바뀌면서 오픈소스가 아니게 됐고, AWS는 ElastiCache의 기본 엔진으로 Valkey를 민다. Valkey는 Redis 대비 노드 비용이 저렴하고 7.2에서 네 인증 방식을 모두 지원하므로 실습·운영 모두에서 Valkey가 기본으로 합리적이다.
- AUTH token은 클러스터 공용 password라 사용자 단위 권한 분리와 감사가 안 되고, 장기 password가 코드·환경변수에 남는다. RBAC는 사용자 단위 권한을, IAM은 SigV4로 서명한 15분짜리 임시 token을 써서 장기 password를 없앤다.
- IAM 전용 user group을 만들 수 있는 것은 Valkey engine의 성질이다. Valkey user group은 default user가 반드시 있어야 하는 제약이 없어, IAM user만 남긴 IAM 전용 상태를 만들 수 있다.
- 이미 떠 있는 AUTH token 클러스터를 무중단으로 전환할 때는 `default` user(password=기존 token)를 다리로 두고 IAM user로 트래픽을 옮긴 뒤 `default`를 뺀다. AUTH가 연결 단위로 한 번만 검사되는 성질 때문에 이 순서가 성립한다. 전환 절차는 `aws/elasticache-authentication` 핸즈온에 있다.

## Citations

1. AWS ElastiCache RBAC: <https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Clusters.RBAC.html>
2. AWS ElastiCache IAM 인증: <https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/auth-iam.html>
