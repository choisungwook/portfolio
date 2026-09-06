---
type: Decision
title: public NLB 진입과 AWS API 권한을 분리
description: 공개 NLB TCP 443은 모든 IPv4에 허용하고 IAM·backend 경계는 유지한다.
tags: [aws, nlb, security-group, iam]
timestamp: 2026-09-06T00:00:00Z
---

## 결정

- S01·S07 public NLB의 기본 소스 CIDR은 0.0.0.0/0, 허용 포트는 TCP 443.
- NLB·프록시·endpoint의 SG 참조는 유지.
- S01·S07의 trusted_principal_arn은 클라이언트 AWS 프로파일 뒤의 기존 IAM 사용자·Role로 제한.
- 실습 Role trust, Memory endpoint 정책·SourceVpce 조건 유지. STS endpoint 정책은 PoC 동안 Principal *·sts:*([프로파일 결정](2026-09-client-profile-principal.md) 참고).

## 이유

- 검증 대상은 클라이언트의 outbound 목적지 고정. 공개 NLB의 소스 IP 제한은 별도의 조건.
- NLB에 TCP 연결할 수 있는 것과 AWS API에서 권한을 받는 것은 다른 단계.
- 공개 프록시의 외부 연결은 NLB 처리 비용·EC2 부하로 이어질 수 있으므로 AWS 공개 API와 운영 비용의 주체가 다름.

관련 설계: [AWS 호스트명과 TLS 유지](2026-09-preserve-aws-hostname.md).
