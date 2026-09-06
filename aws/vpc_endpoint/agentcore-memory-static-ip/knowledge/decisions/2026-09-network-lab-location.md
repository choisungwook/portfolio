---
type: Decision
title: AWS API 연결 실습을 VPC endpoint 아래에 분류
description: 네트워크 실습은 VPC endpoint 아래에 두고 연결 그림과 실험은 시나리오별 문서에서 함께 관리한다.
tags: [aws, vpc-endpoint, documentation, architecture]
timestamp: 2026-09-05T15:00:00Z
---

## 결정

- 네트워크 실습 위치는 aws/vpc_endpoint/agentcore-memory-static-ip.
- 인증서 발급·교체·폐기 실습은 aws/iam/roles-anywhere에 유지.
- 각 시나리오의 docs/scenarios/sNN/2-experiment.md 안에 연결 그림과 인증 순서 배치.
- README는 환경 준비와 아키텍처·실험 문서의 링크 허브로 유지.
- 공개 사례의 그림은 Roles Anywhere docs/usecase.md에 유지.

## 이유

- 실습의 주제는 VPC endpoint·NLB·DNS·프록시 경로 비교이며 Memory는 호출 결과를 확인할 대상.
- 이 workspace의 인증은 STS 하나. Roles Anywhere는 인증서 workspace에서 다루고, 고정 IP 경로에 얹는 것은 [범위 축소 결정](2026-09-poc-scope-s01-s05-s07.md)대로 나중에 S01 확장.
- 인증 요청과 데이터 요청, 클라이언트 통신과 AWS 서비스 간 통신을 그림에서 구분할 필요가 있음.
- 해당 시나리오의 구조와 실험을 한 문서에서 읽을 수 있어야 함.
