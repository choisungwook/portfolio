---
type: Topic
title: 실습 hosted zone은 등록기관 네임서버 기준으로 권한이 있어야 한다
description: Route 53에 위임 레코드가 있어도 등록기관 NS가 다른 사업자를 가리키면 인터넷에서 조회되지 않는다.
tags: [aws, route53, dns, acm]
timestamp: 2026-09-06T18:30:00Z
---

## 통찰

- 2026-09-06 확인. 실습용 zone demo.akbun.com은 Route 53에 있고, 부모 akbun.com zone도 Route 53에 있으며 그 안에 demo NS 위임 레코드까지 있다. 그런데 등록기관(Route 53 Domains)의 네임서버는 Cloudflare로 설정되어 있어 인터넷은 Cloudflare에 묻고, Cloudflare에는 demo NS가 없어 NXDOMAIN이다.
- 즉 "Route 53에 레코드가 있다"와 "인터넷에서 조회된다"는 별개다. 권한은 등록기관의 NS 설정이 정한다. `whois <도메인> | grep -i "name server"`와 `dig +short NS <zone>`이 같은 네임서버를 가리켜야 한다.
- 이 상태에서는 S05 alias, S07 프록시 이름, ACM DNS 검증 CNAME이 모두 조회되지 않는다. ACM 인증서 FAILED의 원인도 같다.
- 해결은 둘 중 하나. (a) Cloudflare의 akbun.com에 demo NS 4개를 추가해 하위 zone만 Route 53로 위임. (b) 등록기관 NS를 Route 53 akbun.com zone의 NS로 바꿔 전체를 Route 53로 이전. (b)는 Cloudflare가 서비스하는 다른 레코드가 끊기므로 블로그 등 기존 레코드를 먼저 옮겨야 한다.
- 2026-09-06 결과: Cloudflare의 akbun.com에 demo NS 4개를 추가해 (a)로 해결. 공개 resolver가 Route 53 demo zone을 조회하게 되었고 S05가 실제로 재현됨. ACM은 *.demo.akbun.com으로 재요청(검증 CNAME이 demo zone 안에 있어 Route 53에서 검증). *.akbun.com 인증서는 검증 CNAME이 Cloudflare 영역이라 사용하지 않음.
- Terraform의 Route 53 레코드는 route53_zone_id가 null이면 만들지 않도록 선택 사항으로 유지. 권한 DNS가 다른 사업자인 사람은 이름만 넣고 레코드를 직접 만든다.
- zone ID·도메인은 저장소에 두지 않고 `terraform.tfvars`에만 둔다. 문서 예제는 example.com.

## 왜 남기는가

- Terraform apply와 Route 53 콘솔은 위임 여부를 알려 주지 않는다. 레코드 생성 성공을 DNS 동작 성공으로 오해하기 쉽다.
- "Route 53 레코드만으로 NLB 호출" 실험(S05)은 이 권한 없이는 TLS 이전 단계(이름 조회)에서 끝나 결론이 나지 않는다.
