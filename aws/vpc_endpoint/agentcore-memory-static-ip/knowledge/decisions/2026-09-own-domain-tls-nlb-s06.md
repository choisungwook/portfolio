---
type: Decision
title: 자체 도메인 TLS 재암호화 직결(S06)은 root state의 opt-in 실험으로 둔다
description: S05가 클라이언트 TLS에서 끝낸 질문을 NLB TLS 종료로 AWS 쪽에 넘겨 확인한다. 판정은 실제 실행 뒤에 적고, PASS여도 기본 권장은 S01이다.
tags: [aws, nlb, tls, acm, route53, sigv4]
timestamp: 2026-09-08T00:00:00Z
---

## 결정

- S06 = Route 53 자체 도메인 → public TLS NLB(ACM 종료) → TLS target group 443 → 같은 endpoint ENI. 앱은 `endpoint_url`만 바꾼다.
- S01 root(`terraform/`)에 `acm_certificate_arn`·`tls_alias_domains`를 함께 넣을 때만 생기는 opt-in 리소스로 둔다. 별도 lab state를 만들지 않는다.
- 기존 TCP NLB에 8443 TLS listener를 얹지 않고 서비스별 TLS NLB를 새로 만든다.
- 클라이언트는 AWS 거부(REJECTED, 종료 코드 2)와 도달 전 실패(FAIL, 1)를 구분해 출력한다.
- 판정은 "미확정"으로 문서화하고 실제 실행 결과를 4-validation과 실험 문서에 적는다. PASS여도 기본 권장은 S01, S06은 endpoint_url만 바꿀 수 있는 앱의 선택지로만 남긴다.

## 이유

- S05는 TCP 통과라 AWS 인증서 이름 불일치에서 끝났다. "우리 인증서로 종료하면?"이 자연스러운 다음 질문이고, 답은 AWS 서비스가 SNI 없는 연결과 우리 Host를 받는지에 달려 있어 실험이 필요하다.
- 같은 endpoint ENI·Role·Memory를 재사용하므로 root state에 두는 것이 가장 짧다. 변수 둘을 비우면 plan에 아무 변화가 없어 S01 사용자에게 비용이 없다.
- 8443은 방화벽 허용 목록(443)과 실제 사용 형태가 달라져 실험 의미가 흐려진다. NLB 하나 추가 비용은 실습 규모에서 감수한다.
- TLS listener → TLS target 구간에서 NLB는 SNI를 전달하지 않고 target 인증서를 검증하지 않는다. 종단 간 검증이 아니고, Host 수용은 공개 문서에 없는 동작이라 PASS여도 운영 기본값으로 삼기 어렵다.
- 이 세션에는 AWS 자격증명이 없어 실제 실행을 못 했다. 모의 검증만 끝난 상태를 검증 완료로 적으면 다음 세션이 믿는다.

## Citations

1. [S06 실험 문서](../../docs/scenarios/s06/2-experiment.md)
2. [AWS 호스트명과 TLS 유지](2026-09-preserve-aws-hostname.md)
3. [DNS 변경 불가와 인증 방식 분리](2026-09-separate-auth-from-routing.md)
