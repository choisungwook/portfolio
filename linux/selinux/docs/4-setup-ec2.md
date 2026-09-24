# EC2 실습 환경 (SELinux, 커널 dm-verity)

Amazon Linux 2023 EC2 1대를 띄운다. SELinux 실습과 커널 dm-verity 실습을 모두 여기서 한다.

## 만들어지는 것

| 리소스 | 값 |
|---|---|
| EC2 | t3.medium (x86_64), default VPC의 첫 default subnet |
| AMI | Amazon Linux 2023 최신, kernel 6.1 |
| 볼륨 | 루트 30GiB gp3 암호화 |
| IAM | `AmazonSSMManagedInstanceCore` instance profile |
| Security group | egress만. ingress 없음 |

- user data가 `semanage`, `sesearch`, `nginx`, `cryptsetup`을 설치한다. 코드는 [terraform/user_data.tf](../terraform/user_data.tf)
- SELinux는 AL2023 기본값인 permissive로 뜬다. enforcing으로 바꾸는 것부터 실습이다
- Graviton으로 띄우려면 `TF_VAR_arch=arm64`, `TF_VAR_instance_type=t4g.medium`을 함께 넘긴다

## 준비

- Terraform 1.11 이상, AWS CLI v2, session-manager-plugin
- 관리자 권한 AWS profile

## up

```bash
terraform -chdir=terraform init && terraform -chdir=terraform apply -auto-approve
```

SSM 등록과 패키지 설치까지 2~3분 걸린다. 접속 명령은 output에 있다.

```bash
eval "$(terraform -chdir=terraform output -raw ssm_command)"
```

접속한 뒤 root로 바꾼다. 이후 실습 명령은 모두 root 셸에서 실행한다.

```bash
sudo -i
```

## down

```bash
terraform -chdir=terraform destroy -auto-approve
```

## 켜 둔 동안의 비용

| 대상 | 시간당 USD |
|---|---:|
| t3.medium 1대 (서울) | 약 0.052 |
| EBS 30GiB, 공인 IPv4 1개 | 약 0.009 |
