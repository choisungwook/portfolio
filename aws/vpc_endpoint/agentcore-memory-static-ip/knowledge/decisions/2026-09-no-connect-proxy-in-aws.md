---
type: Decision
title: AWS 안의 CONNECT proxy(S07)는 권장 구성이 아니다
description: IAM이 이미 인증·인가를 제공하므로 AWS 쪽에 별도 인증이 필요한 프록시 홉을 두지 않는다. 프록시가 필요하면 애플리케이션 네트워크 쪽에 둔다.
tags: [aws, proxy, nlb, iam, architecture]
timestamp: 2026-09-06T21:00:00Z
---

## 결정

- S07(public TLS NLB → EC2 CONNECT proxy → VPCE)은 2026-09-06 실제 AWS에서 PASS했지만 권장 구성에서 제외한다. 문서와 코드는 "왜 아닌지"를 보여 주는 참고 예제로만 유지한다.
- 고정 IP 경로의 기본은 S01(TCP passthrough NLB, AWS 이름 유지, DNS만 변경)이다.
- DNS를 바꿀 수 없는 환경이면 프록시는 AWS가 아니라 애플리케이션이 배포된 네트워크 쪽에 둔다. 2026-09-06 S02(Squid 컨테이너, --add-host로 이름 → EIP)로 구현해 실제 PASS. 그 프록시는 AWS 이름을 NLB EIP로 해석해 TCP passthrough만 하고, TLS·SNI·Host·SigV4는 그대로 통과한다. 즉 S01의 hosts 역할을 클라이언트 쪽 프록시 또는 DNS forwarder가 대신한다.

## 이유

- AWS API의 인증·인가는 IAM(SigV4·Role trust·endpoint policy)이 끝까지 담당한다. 중간에 EC2 프록시를 두면 그 프록시 자체의 인증·인가(누가 CONNECT할 수 있는가)를 따로 설계·운영해야 하고, 이는 IAM이 이미 해결한 문제를 다시 만드는 것이다. 실습의 프록시는 인증이 없어 인터넷에 열린 상태였다.
- 프록시가 AWS 안에 있으면 self-managed EC2의 패치·가용성·로그·ACM 인증서·자체 도메인이 전부 추가 운영 항목이 된다. S01은 관리형 NLB·endpoint뿐이다.
- 해결할 문제는 "클라이언트가 AWS 이름을 어떤 IP로 보내느냐"이며, 이는 클라이언트 네트워크 안에서 풀어야 할 DNS 문제다. AWS 쪽 구성 요소를 늘려서 풀 이유가 없다.

- 프록시는 AWS API 클라이언트에만 지정한다. 전역 HTTPS_PROXY는 자격증명 체인의 외부 호출(aws login 갱신, SSO)까지 프록시로 보내 허용 목록에 막힌다. 실무에서는 그 호스트를 허용 목록에 넣거나 NO_PROXY로 뺀다.

## Citations

1. [PoC 범위 축소](2026-09-poc-scope-s01-s05-s07.md)
2. [AWS 호스트명과 TLS 유지](2026-09-preserve-aws-hostname.md)
