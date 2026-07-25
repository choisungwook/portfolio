# 실습환경 구축

EC2 인스턴스 2대를 Terraform으로 만든다.

| 인스턴스 | AMI | 커널 | JDK | 역할 |
|---|---|---|---|---|
| legacy | Amazon Linux 2 초기 AMI | 4.14 | Corretto 8 | /dev/random blocking 재현 |
| modern | Amazon Linux 2023 | 6.1 | Corretto 17 | 대조 실험 |

두 인스턴스 모두 default VPC에 배치하고 SSM Session Manager로 접속한다. SSH를 쓰지 않으므로 security group ingress가 없다.

## 생성

terraform 디렉터리에서 apply한다.

```bash
cd terraform
terraform init
terraform apply
```

user_data가 JDK 설치와 rngd 중지를 수행하므로 인스턴스 기동 후 2~3분 기다린다.

## 접속

apply output에 나온 SSM 명령으로 접속한다.

```bash
terraform output -raw ssm_connect_legacy
aws ssm start-session --target <legacy-instance-id> --region ap-northeast-2
```

## 정리

실습이 끝나면 삭제한다.

```bash
terraform destroy
```
