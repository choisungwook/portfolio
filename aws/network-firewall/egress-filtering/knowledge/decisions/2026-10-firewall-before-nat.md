---
type: Decision
title: firewall은 NAT 앞에 두고, app subnet은 VPC 모듈 밖에서 AZ별 route table로 만든다
description: 로그에 서버 IP를 남기려고 NAT 앞에 두고, single NAT에서도 AZ별 대칭 라우팅을 하려고 app subnet을 직접 만든다.
tags: [aws, network-firewall, terraform, vpc]
timestamp: 2026-10-31T00:00:00Z
---

## 결정

- firewall endpoint는 app subnet과 NAT gateway 사이에 둔다. 경로는 app → vpce(같은 AZ) → firewall subnet → NAT → IGW, 돌아오는 경로는 public route table의 `app CIDR → vpce(같은 AZ)`.
- public subnet, firewall subnet(모듈의 `intra_subnets`), NAT 1개는 `terraform-aws-modules/vpc`로 만들고, app subnet과 AZ별 route table은 `app_subnet.tf`에서 직접 만든다. 모듈의 `create_private_nat_gateway_route = false`가 필요하다.
- firewall, policy, rule group, route 변경은 콘솔 실습 대상이라 Terraform에 넣지 않는다. log group과 log resource policy만 Terraform이 만든다.

## 이유

- NAT 뒤에 두면 firewall이 보는 출발지가 NAT IP라 alert 로그로 어느 서버가 막혔는지 알 수 없다. NAT 앞이면 `event.src_ip`가 서버 private IP다.
- 모듈은 private route table 수를 NAT 수에 맞춰서 `single_nat_gateway = true`면 1개만 만든다. route table이 하나면 `0.0.0.0/0`을 endpoint 하나에만 보낼 수 있어 AZ c 트래픽이 AZ a endpoint로 간다.
- private subnet 없이 모듈을 쓰면 모듈이 없는 private route table에 NAT route를 만들려다 `element()` 오류로 plan이 실패한다.
- log resource policy가 없으면 로깅을 켤 때 계정 공용 `AWSLogDeliveryWrite20150319` 정책이 수정된다. 전용 정책을 두었을 때 공용 정책이 바뀌지 않는 것을 확인했다.
