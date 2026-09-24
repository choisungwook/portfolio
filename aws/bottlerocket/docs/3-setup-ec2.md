# EC2 단독 실습 환경

클러스터 없이 Bottlerocket EC2 1대를 띄운다. AMI는 EKS 노드와 같은 `aws-k8s-1.36` 변형이다. 설정 키와 host container 동작이 EKS 노드와 같아서 여기서 본 결과를 EKS 운영에 그대로 옮길 수 있다. 4, 5, 6장이 이 환경을 쓴다.

## 만들어지는 것

| 리소스 | 값 |
|---|---|
| EC2 | t4g.medium, default VPC의 첫 default subnet |
| AMI | SSM public parameter `/aws/service/bottlerocket/aws-k8s-1.36/arm64/<버전>/image_id` |
| 볼륨 | xvda는 AMI 크기 그대로, xvdb 20GiB. 둘 다 gp3 암호화 |
| IAM | `AmazonSSMManagedInstanceCore` instance profile |
| Security group | egress만. ingress 없음 |

- user data는 [terraform/ec2/user_data.tf](../terraform/ec2/user_data.tf)의 TOML이다. `settings.kubernetes`가 없어 kubelet은 시작하지 못한다. host와 host container는 정상 동작한다
- 버전 기본값은 `latest`다. 6장의 A/B 업데이트를 보려면 최신보다 낮은 버전으로 띄운다. 처음부터 그렇게 띄우면 인스턴스를 다시 만들지 않아도 된다

## 준비

준비물은 [1-scenario.md](1-scenario.md)의 준비물 절에 있다. 아래는 선택 사항이다.

6장의 A/B 업데이트 실습을 할 계획이면 이전 버전을 고른다. 이 변형에 게시된 버전 목록을 조회한다.

```bash
aws ssm get-parameters-by-path --region ap-northeast-2 \
  --path /aws/service/bottlerocket/aws-k8s-1.36/arm64 \
  --query 'Parameters[].Name' --output text | tr '\t' '\n' | grep image_id
```

목록에서 latest 바로 아래 버전을 넘긴다.

```bash
export TF_VAR_bottlerocket_version="<이전 버전>"
```

4장의 admin container SSH 비교 절을 할 계획이면 공개키를 넘긴다. 넘기지 않으면 admin container는 꺼진 채로 뜨고, 4장에서 SSM 세션 안에서 켠다.

```bash
export TF_VAR_admin_ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)"
```

## up

workspace 루트(`aws/bottlerocket`)에서 실행한다.

```bash
terraform -chdir=terraform/ec2 init && terraform -chdir=terraform/ec2 apply -auto-approve
```

SSM 등록까지 1~2분 걸린다. 접속 명령은 output에 있다.

```bash
terraform -chdir=terraform/ec2 output -raw ssm_command
```

등록됐는지 세션을 열기 전에 확인한다. `PingStatus`가 `Online`이면 된다.

```bash
INSTANCE_ID=$(terraform -chdir=terraform/ec2 output -raw instance_id)
aws ssm describe-instance-information --region ap-northeast-2 \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --query 'InstanceInformationList[0].[PingStatus,PlatformName,PlatformVersion]' --output text
```

## 버전을 바꿔 다시 띄우기

- 인스턴스는 `ignore_changes = [ami]`라서 이미 떠 있을 때 버전을 바꾸면 `apply`만으로는 교체되지 않는다. latest가 새로 게시될 때마다 인스턴스가 교체되는 것을 피하려는 설정이다
- 떠 있는 인스턴스의 버전을 바꾸려면 `-replace`로 교체한다

```bash
terraform -chdir=terraform/ec2 apply -auto-approve -replace=aws_instance.bottlerocket
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

## 트러블슈팅

| 증상 | 원인 | 확인과 조치 |
|---|---|---|
| `apply`가 `no matching EC2 VPC found` | default VPC가 없다 | 콘솔 VPC 메뉴의 Actions에서 Create default VPC. 실습 뒤 지워도 된다 |
| `apply`가 SSM parameter `ParameterNotFound` | 버전 문자열이 게시 목록에 없다 | 위 준비 절의 조회 명령으로 목록을 다시 보고 `TF_VAR_bottlerocket_version`을 맞춘다 |
| `apply`가 `InvalidParameterValue` 또는 아키텍처 불일치 | `arch`와 `instance_type`이 어긋났다 | arm64면 t4g, x86_64면 t3 계열. 둘을 같이 바꾼다 |
| `describe-instance-information`이 비어 있음 | SSM agent가 아직 등록 전이거나 egress가 없다 | 2분 기다린다. 그래도 없으면 보안그룹 egress와 instance profile을 본다 |
| `start-session`이 `TargetNotConnected` | 위와 같음 | `PingStatus`가 `Online`이 된 뒤 다시 시도한다 |
| `start-session`이 `SessionManagerPlugin is not found` | 로컬에 plugin이 없다 | [1-scenario.md](1-scenario.md)의 준비물 절 |

SSM 등록이 계속 안 되면 EC2 시리얼 콘솔 출력에서 부팅 로그를 본다. Bottlerocket은 로그를 볼 다른 수단이 없다.

```bash
aws ec2 get-console-output --region ap-northeast-2 --instance-id "$INSTANCE_ID" --latest --output text | tail -50
```
