---
type: Decision
title: 고정 IP 실험에서 AWS 호스트명과 TLS를 유지
description: DNS 변경이 가능한 직접 NLB 통과 시나리오에서 AWS 호스트명을 유지한다.
tags: [aws, nlb, sts, agentcore, tls]
timestamp: 2026-09-05T00:00:00Z
---

## 결정

- 적용 범위: S01의 DNS 변경 가능·TCP NLB 통과 경로.
- 인증 서비스와 Memory에 NLB를 하나씩 배치하고 모두 TCP 443 사용.
- AWS regional hostname을 유지하고 로컬 /etc/hosts로 EIP 고정.
- 클라이언트는 uv 가상환경에서 Python으로 직접 실행. 리소스도 Terraform 명령으로 직접 관리.
- hosts는 표시된 실습 블록만 수동 추가·제거. 클라이언트 코드는 OS 파일·방화벽을 수정하지 않음.
- PrivateLink ENI IP를 target으로 등록하고 client IP preservation·Proxy Protocol 비활성화.
- 기존 VPC의 DNS 동작을 바꾸지 않도록 endpoint private DNS 비활성화.
- Memory는 단기 이벤트만 사용하고 서비스별 경로를 모두 검증.

## 이유

- NLB 단일 listener에는 SNI별 target group 라우팅 기능이 없음.
- 사용자 도메인 별칭은 AWS 인증서 이름을 바꾸지 않음.
- HTTP Host 변경은 SigV4 검증에도 영향을 줌.
- PrivateLink ENI는 client IP preservation을 지원하지 않음.
- STS 경로만 고정해도 Memory 데이터 요청의 outbound 문제는 남음.
- NLB 경유 호출 성공과 방화벽의 허용 외 목적지 차단은 별도의 검증 대상.
- 장기기억의 모델 추출·cross-region inference는 네트워크 인증 실험과 독립적인 변수.
- DNS 변경 불가 경로는 [별도 결정](2026-09-separate-auth-from-routing.md)의 CONNECT proxy 사용.

## Citations

1. [AWS 공식 문서 발췌와 확인 사항](../references/aws-networking-excerpts.md)
