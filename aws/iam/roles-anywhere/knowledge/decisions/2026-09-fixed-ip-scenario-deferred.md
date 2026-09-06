---
type: Decision
title: 고정 IP 경로의 Roles Anywhere 시나리오는 나중에 S01 확장으로
description: 네트워크 workspace에서 Roles Anywhere 시나리오를 삭제했고, 인터넷·public NLB·Roles Anywhere 조합은 심화학습으로 미룬다.
tags: [aws, roles-anywhere, nlb, scope]
timestamp: 2026-09-06T16:30:00Z
---

## 결정

- 이 workspace는 public Roles Anywhere endpoint로 인증 원리·교체·CRL만 다룬다. 고정 IP·NLB 조건은 여기에 넣지 않는다.
- 네트워크 workspace(aws/vpc_endpoint/agentcore-memory-static-ip)는 2026-09-06에 S01·S05·S07(STS 전용)만 남기고 VPN·Roles Anywhere 시나리오(S02·S03·S04·S06·S08)와 helper·PKI·RA 모듈을 삭제했다.
- 인터넷 + public NLB + Roles Anywhere는 아직 없는 시나리오다. 필요해지면 네트워크 workspace의 S01에 rolesanywhere interface endpoint·NLB·EIP 한 세트와 trust anchor를 추가하는 형태로 만든다. 새 workspace를 만들지 않는다.
- 이 workspace 문서에서 삭제된 시나리오로 향하던 링크는 네트워크 workspace README의 심화학습 항목으로 바꾼다.

## 이유

- 실제 요구는 인터넷 outbound 허용 목록 환경에서 고정 EIP로 AWS를 호출하는 것. VPN 전제 시나리오는 그 환경과 무관하고, 1시간 PoC 제약에서 8개 유지가 목적을 가렸다.
- Roles Anywhere 인증 코드를 두 workspace에 두면 helper·PKI·credential_process를 중복 관리한다. 인증은 여기, 네트워크는 저쪽으로 나눈 기존 결정을 유지한다.
- 인증서 인증은 HTTPS 서버 이름 검증을 바꾸지 않으므로, 고정 IP 경로에서 Roles Anywhere가 추가로 요구하는 것은 rolesanywhere endpoint 세트 하나뿐이다. S01 패턴 복제로 충분하다.

## Citations

1. [네트워크 workspace의 PoC 범위 축소 결정](../../../../vpc_endpoint/agentcore-memory-static-ip/knowledge/decisions/2026-09-poc-scope-s01-s05-s07.md)
2. [인증서 수명과 AWS 세션 수명 분리](2026-09-certificate-lifecycle-boundaries.md)
