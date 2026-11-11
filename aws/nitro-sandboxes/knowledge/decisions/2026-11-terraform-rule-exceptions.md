---
type: Decision
title: 저장소 terraform 기본값과 다르게 만든 부분
description: default VPC, SSM 접속, t4g, kernel 6.1 AMI 기본값을 따르지 않은 이유
tags: [terraform, aws, nitro-sandboxes]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-11T00:30:00Z }
sources:
  - id: ec2-limits
    resource: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/amazon-ec2-nitro-sandboxes.html#nitro-sandboxes-considerations
    title: Nitro Sandboxes considerations and limitations
---

# 저장소 terraform 기본값과 다르게 만든 부분

## 결정

- default VPC 대신 `terraform-aws-modules/vpc/aws`로 실습 전용 VPC를 만든다.
- EC2 접속은 SSM이 아니라 SSH이고, security group은 TCP 22를 `apply` 시점의 공인 IP `/32`에서만 허용한다. EKS API endpoint도 같은 `/32`로만 연다.
- 부모 인스턴스는 `t4g` 대신 `m7g.large`, AMI는 kernel 6.1이 아니라 `al2023-ami-kernel-6.18-arm64`다.

## 이유

- VPC와 접속 방식은 핸즈온을 요청할 때 명시된 조건이다. default VPC를 쓰지 않고, 접근은 내 공유기 IP로만 연다.
- `t4g`, flex, `m7g.medium`은 Nitro Sandboxes를 지원하지 않는다[^ec2-limits]. `m7g.large`가 지원 목록에서 가장 작은 Graviton 타입이다.
- Sandbox 드라이버는 AL2023 `kernel6.18` 패키지에만 있다. kernel 6.1 AMI로 띄우면 `/dev/nitro_enclaves`는 있어도 Sandbox를 만들 수 없다.
