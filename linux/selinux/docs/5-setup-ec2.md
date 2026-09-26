# EC2 실습 환경 (AL2023 x86_64)

SELinux와 커널 dm-verity 실습용 EC2 1대를 띄운다. SELinux는 host 커널의 LSM이라 M3 Mac의 Docker Desktop VM에서는 켤 수 없다.

## 만들어지는 것

| 리소스 | 값 |
|---|---|
| EC2 | t3.medium, Amazon Linux 2023 x86_64, default VPC의 첫 default subnet |
| 볼륨 | 루트 30GiB gp3 암호화 |
| IAM | `AmazonSSMManagedInstanceCore` instance profile |
| Security group | egress만. ingress 없음 |

user data가 설치하는 패키지는 [terraform/user_data.tf](../terraform/user_data.tf)에 있다.

| 패키지 | 쓰는 곳 |
|---|---|
| docker, container-selinux | 컨테이너 라벨 실습. `/etc/docker/daemon.json`에 `selinux-enabled: true` |
| policycoreutils-python-utils | `semanage`, `audit2allow`, `audit2why` |
| setools-console | `sesearch`, `seinfo` |
| checkpolicy, selinux-policy-devel | 정책 모듈 빌드 |
| cryptsetup | `veritysetup` |

- arm64로 띄우려면 `TF_VAR_arch=arm64`, `TF_VAR_instance_type=t4g.medium`을 함께 넘긴다

## 준비

- Terraform 1.11 이상, AWS CLI v2, session-manager-plugin
- 관리자 권한 AWS profile

## up

workspace 루트(`linux/selinux`)에서 실행한다.

```bash
terraform -chdir=terraform init && terraform -chdir=terraform apply -auto-approve
```

SSM 등록과 패키지 설치에 2~3분 걸린다. 접속 명령은 output에 있다.

```bash
$(terraform -chdir=terraform output -raw ssm_command)
```

접속하면 root로 바꾸고 설치가 끝났는지 확인한다.

```bash
sudo -i
rpm -q docker container-selinux cryptsetup policycoreutils-python-utils setools-console
```

## down

```bash
terraform -chdir=terraform destroy -auto-approve
```

## 켜 둔 동안의 비용

| 대상 | 시간당 USD |
|---|---:|
| t3.medium 1대 | 약 0.052 |
| EBS 30GiB, 공인 IPv4 1개 | 약 0.01 |
