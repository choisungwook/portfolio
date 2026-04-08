# AWS Transit Gateway 핸즈온

Transit Gateway의 개념을 이해하고, 3개 VPC를 Transit Gateway로 연결하는 실습입니다.

## 블로그 포스트

[blog-post.md](./blog-post.md)에서 Transit의 의미, VPC Peering/PrivateLink와의 비교 설명을 확인할 수 있습니다.

## 아키텍처

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   VPC A      │     │   VPC B      │     │   VPC C      │
│ 10.10.0.0/16 │     │ 10.20.0.0/16 │     │ 10.30.0.0/16 │
│              │     │              │     │              │
│  ┌────────┐  │     │  ┌────────┐  │     │  ┌────────┐  │
│  │ EC2-A  │  │     │  │ EC2-B  │  │     │  │ EC2-C  │  │
│  └────────┘  │     │  └────────┘  │     │  └────────┘  │
└───────┼──────┘     └───────┼──────┘     └───────┼──────┘
        │                    │                    │
        └────────────┬───────┘────────────────────┘
                     │
              ┌──────┴──────┐
              │   Transit   │
              │   Gateway   │
              └─────────────┘
```

## 실습 방법

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

## 검증

terraform apply 완료 후, output에 출력되는 SSM 명령어로 EC2에 접속하여 ping 테스트를 수행합니다.

```bash
# VPC A EC2에 접속
aws ssm start-session --target <instance-id-a>

# VPC B EC2로 ping
ping <vpc-b-ec2-private-ip>

# VPC C EC2로 ping
ping <vpc-c-ec2-private-ip>
```

## 정리

```bash
terraform destroy
```
