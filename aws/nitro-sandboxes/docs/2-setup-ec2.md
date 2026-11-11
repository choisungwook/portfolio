# EC2 부모 인스턴스 실습 환경

시나리오 3이 쓰는 환경입니다. 실습 전용 VPC에 Nitro Enclaves를 켠 Graviton 인스턴스 한 대를 띄웁니다.

## 만들어지는 것

| 리소스 | 값 |
|---|---|
| VPC | `terraform-aws-modules/vpc/aws` 6.7, `10.10.0.0/16`, public subnet 2개, NAT 없음 |
| EC2 | `m7g.large`(2 vCPU, 8GiB), Nitro Enclaves 켬, IMDSv2 필수 |
| AMI | SSM parameter `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.18-arm64` |
| 볼륨 | 30GiB gp3, 암호화 |
| Security group | ingress는 TCP 22를 내 공인 IP `/32`에서만 허용. egress 전체 |
| Key pair | 로컬 `~/.ssh/id_ed25519.pub`을 등록 |

인스턴스 타입과 AMI는 아무거나 고를 수 없습니다.

- `t4g`, flex 계열, `m7g.medium`은 Nitro Sandboxes를 지원하지 않습니다. 지원 목록에서 가장 작은 Graviton 타입이 `m7g.large`입니다.
- Sandbox 드라이버는 AL2023의 `kernel6.18` 패키지(`6.18.51-120.162.amzn2023` 이상)에 들어 있습니다. 기본 AMI인 kernel 6.1 계열에는 없습니다.
- Graviton은 vCPU 하나가 물리 코어 하나입니다. Intel처럼 코어당 스레드가 2개인 타입은 코어 하나를 Sandbox 하나만 쓸 수 있어 쓸 수 있는 CPU가 vCPU의 절반쯤으로 줄어듭니다.

## up

workspace 루트(`aws/nitro-sandboxes`)에서 실행합니다. SSH 공개키 경로가 다르면 `TF_VAR_ssh_public_key_path`로 넘깁니다.

```bash
terraform -chdir=terraform/ec2 init
terraform -chdir=terraform/ec2 apply -auto-approve
```

1분 안에 끝납니다. 접속 명령은 output에 있습니다.

```bash
terraform -chdir=terraform/ec2 output -raw ssh_command
```

실습 파일(`guest/` 디렉터리)을 부모 인스턴스 홈 디렉터리로 복사합니다.

```bash
PARENT_IP=$(terraform -chdir=terraform/ec2 output -raw ssh_command | cut -d@ -f2)
scp guest/sandbox-init guest/find-marker.py guest/sandbox.json ec2-user@${PARENT_IP}:~/
```

## 접속이 막힐 때

security group은 `apply`할 때의 공인 IP 하나만 허용합니다. 네트워크를 옮겨 공인 IP가 바뀌면 `apply`를 다시 실행하면 규칙이 새 IP로 바뀝니다.

## down

다음 명령을 실행합니다.

```bash
terraform -chdir=terraform/ec2 destroy -auto-approve
```

남은 리소스가 없는지 Project 태그로 확인합니다. 빈 결과가 나와야 합니다.

```bash
aws resourcegroupstaggingapi get-resources --region ap-northeast-2 \
  --tag-filters Key=Project,Values=nitro-sandboxes-ec2 \
  --query 'ResourceTagMappingList[].ResourceARN'
```
