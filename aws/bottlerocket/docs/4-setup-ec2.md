# EC2 단독 실습 환경

클러스터 없이 Bottlerocket EC2 1대를 띄운다. AMI는 EKS 노드와 같은 `aws-k8s-1.36` 변형이다. 설정 키와 host container 동작이 EKS 노드와 같아서 여기서 본 결과를 EKS 운영에 그대로 옮길 수 있다.

## 만들어지는 것

| 리소스 | 값 |
|---|---|
| EC2 | t4g.medium, default VPC의 첫 default subnet |
| AMI | SSM public parameter `/aws/service/bottlerocket/aws-k8s-1.36/arm64/<버전>/image_id` |
| 볼륨 | xvda는 AMI 크기 그대로, xvdb 20GiB. 둘 다 gp3 암호화 |
| IAM | `AmazonSSMManagedInstanceCore` instance profile |
| Security group | egress만. ingress 없음 |

- user data는 [terraform/ec2/user_data.tf](../terraform/ec2/user_data.tf)의 TOML이다. `settings.kubernetes`가 없어 kubelet은 시작하지 못한다. host와 host container는 정상 동작한다
- 버전 기본값은 `latest`다. A/B 업데이트를 보려면 최신보다 낮은 버전으로 띄운다

## 준비

- Terraform 1.11 이상, AWS CLI v2, session-manager-plugin
- 관리자 권한 AWS profile

A/B 업데이트 실습을 할 때만 이전 버전을 고른다. 이 변형에 게시된 버전 목록을 조회한다.

```bash
aws ssm get-parameters-by-path --region ap-northeast-2 \
  --path /aws/service/bottlerocket/aws-k8s-1.36/arm64 \
  --query 'Parameters[].Name' --output text | tr '\t' '\n' | grep image_id
```

목록에서 latest 바로 아래 버전을 넘긴다.

```bash
export TF_VAR_bottlerocket_version="<이전 버전>"
```

admin container SSH 비교 실습을 할 때만 공개키를 넘긴다.

```bash
export TF_VAR_admin_ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)"
```

## up

```bash
terraform -chdir=terraform/ec2 init && terraform -chdir=terraform/ec2 apply -auto-approve
```

SSM 등록까지 1~2분 걸린다. 접속 명령은 output에 있다.

```bash
terraform -chdir=terraform/ec2 output -raw ssm_command
```

## down

```bash
terraform -chdir=terraform/ec2 destroy -auto-approve
```

## 켜 둔 동안의 비용

| 대상 | 시간당 USD |
|---|---:|
| t4g.medium 1대 | 약 0.04 |
| EBS 22GiB, 공인 IPv4 1개 | 약 0.01 |
