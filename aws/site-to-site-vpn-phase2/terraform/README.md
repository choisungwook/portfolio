# VPN Hands-on Terraform

AWS Site-to-Site VPN 핸즈온을 위한 Terraform 코드입니다.

## terraform.tfvars 설정값

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `project_name` | 프로젝트 이름 (리소스 태깅용) | `vpn-handson` |
| `aws_region` | AWS 리전 | `ap-northeast-2` |
| `cloud_vpc_cidr` | AWS Cloud VPC CIDR | `10.10.0.0/16` |
| `onprem_vpc_cidr` | Onprem VPC CIDR | `10.20.0.0/16` |
| `cloud_private_subnets` | AWS Cloud Private 서브넷 | `["10.10.1.0/24", "10.10.2.0/24"]` |
| `cloud_public_subnets` | AWS Cloud Public 서브넷 | `["10.10.101.0/24", "10.10.102.0/24"]` |
| `onprem_private_subnets` | Onprem Private 서브넷 | `["10.20.1.0/24", "10.20.2.0/24"]` |
| `onprem_public_subnets` | Onprem Public 서브넷 | `["10.20.101.0/24", "10.20.102.0/24"]` |
| `cloud_ec2.instance_type` | AWS Cloud Nginx EC2 인스턴스 타입 | `t4g.small` |
| `cloud_ec2.volume_size` | AWS Cloud Nginx EC2 볼륨 크기 (GB) | `20` |
| `onprem_ec2.instance_type` | Onprem VPN Appliance EC2 인스턴스 타입 | `t3.small` |
| `onprem_ec2.volume_size` | Onprem VPN Appliance EC2 볼륨 크기 (GB) | `20` |
| `onprem_nginx.instance_type` | Onprem Nginx EC2 인스턴스 타입 | `t4g.small` |
| `onprem_nginx.volume_size` | Onprem Nginx EC2 볼륨 크기 (GB) | `20` |

## 예상 비용 (ap-northeast-2 기준, 1시간)

| 리소스 | 스펙 | 수량 | 시간당 비용 |
|--------|------|------|-------------|
| EC2 (Cloud Nginx) | t4g.small | 1 | $0.0208 |
| EC2 (Onprem VPN Appliance) | t3.small | 1 | $0.026 |
| EC2 (Onprem Nginx) | t4g.small | 1 | $0.0208 |
| EBS (gp3) | 20GB x 3대 | 60GB | $0.0079 |
| NAT Gateway (Cloud) | - | 1 | $0.059 |
| NAT Gateway (Onprem) | - | 1 | $0.059 |
| **합계** | | | **$0.1935/hour** |

**참고:**
- EBS gp3: $0.096/GB/month (시간당 $0.0001315/GB)
- 데이터 전송 비용은 별도

## TGW+VPN 추가시 예상비용 (ap-northeast-2 기준, 1시간)

| 리소스 | 설명 | 수량 | 시간당 비용 |
|--------|------|------|-------------|
| 기존 인프라 | EC2 + EBS + NAT Gateway | - | $0.1935 |
| Transit Gateway Attachment | VPC Attachment | 1 | $0.07 |
| Transit Gateway Attachment | VPN Attachment | 1 | $0.07 |
| Site-to-Site VPN Connection | VPN 연결 (터널 2개 포함) | 1 | $0.05 |
| **합계** | | | **$0.3835/hour** |

**참고:**
- Transit Gateway 자체는 무료, Attachment 단위로 과금
- VPN Connection은 터널 2개가 기본 포함 (HA 구성)
- 데이터 처리 비용 별도: TGW $0.02/GB, VPN $0.09/GB
