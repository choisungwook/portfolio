---
type: Decision
title: DNS 변경 불가와 인증 방식 분리
description: 인증 방식은 최초 자격증명을, CONNECT proxy는 네트워크 경로를 해결한다. 둘을 섞지 않는다.
tags: [aws, proxy, tls, roles-anywhere]
timestamp: 2026-09-05T00:00:00Z
---

## 결정

- 인증 방식·DNS 변경·proxy 설정을 독립 조건으로 분류.
- DNS 변경 불가이면 자체 도메인의 HTTPS CONNECT proxy 사용(S07). 자체 도메인을 AWS API URL로 직접 쓰는 것은 TCP 통과에서는 S05의 실패 사례이고, NLB에서 우리 인증서로 TLS를 종료하는 변형은 [S06](2026-09-own-domain-tls-nlb-s06.md)에서 따로 확인.
- NLB는 바깥 proxy TLS만 종료. AWS 서비스 TLS·SNI·Host·인증 서명은 터널 안에서 유지.
- Roles Anywhere 인증은 [독립 기본 실습](../../../../iam/roles-anywhere/README.md)에서 다루고 이 workspace에서는 STS만 사용. 인증서로 HTTPS 서버 이름 검증이 바뀌지 않는다는 점만 여기서 유지.

## 이유

- X.509 요청 인증은 HTTPS 서버 인증서의 이름 검증과 독립적.
- HTTP Host를 재작성하는 reverse proxy는 서명 검증까지 영향을 줄 수 있음.
- boto3는 HTTPS CONNECT proxy를 지원하며 forwarding 모드를 쓰지 않으면 AWS TLS를 터널 안에서 유지.

## Citations

1. [boto3 proxy 설정](https://docs.aws.amazon.com/boto3/latest/guide/configuration.html#using-proxies)
2. [PoC 범위 축소](2026-09-poc-scope-s01-s05-s07.md)
