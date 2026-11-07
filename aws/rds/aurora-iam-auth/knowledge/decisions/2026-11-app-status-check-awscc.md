---
type: Decision
title: EC2 application status check는 awscc와 terraform_data로 만든다
description: hashicorp/aws에 리소스가 없어 검사는 awscc, 인스턴스 연결은 local-exec CLI로 관리한다
tags: [terraform, ec2, awscc]
timestamp: 2026-11-07T00:00:00Z
---

## 결정

- 검사 정의는 `awscc_ec2_application_status_check`(CloudFormation `AWS::EC2::ApplicationStatusCheck`)로 만든다.
- 인스턴스 연결은 `terraform_data`의 create/destroy `local-exec`로 `aws ec2 associate-application-status-check`, `disassociate-application-status-check`를 호출한다.
- `health_check_paths`로 source security group을 직접 지정하고 app security group은 그 security group만 허용한다.

## 이유

- 2026-11 기준 hashicorp/aws provider(6.72)에는 리소스가 없고 PR(#49487, #49490)만 열려 있다. awscc 1.109에는 검사 리소스가 있다.
- 연결(association)은 CloudFormation 타입도 없어 선언형으로 만들 방법이 없다.
- source를 생략하면 AWS가 고른 security group에서 probe가 오므로 inbound 규칙을 미리 좁힐 수 없다.
- hashicorp/aws에 리소스가 들어오면 awscc와 local-exec를 그 리소스로 바꾼다.

## Citations

1. <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/application-status-checks.html>
2. <https://github.com/hashicorp/terraform-provider-aws/pull/49487>
