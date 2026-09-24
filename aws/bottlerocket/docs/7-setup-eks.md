# EKS 실습 환경

EKS 1.36 클러스터와 Bottlerocket 관리형 노드그룹(t4g.medium 1대)을 만든다. 8장이 이 환경을 쓴다. EKS 모듈은 [terraform_practice의 eks/module/eks](https://github.com/choisungwook/terraform_practice/tree/v.1.35.5/eks/module/eks) v.1.35.5를 쓴다.

## 만들어지는 것

| 리소스 | 값 |
|---|---|
| EKS 클러스터 | `bottlerocket-1-36`, 1.36, default VPC |
| addon | vpc-cni, kube-proxy, coredns. EKS가 self-managed로 설치 |
| 관리형 노드그룹 | `bottlerocket`, `BOTTLEROCKET_ARM_64`, t4g.medium 1대, label `os=bottlerocket` |
| 노드 IAM role | 모듈 기본. SSM, ECR 읽기, CNI, worker 정책 포함 |
| access entry | terraform을 실행한 IAM role에 cluster admin |

- launch template user data는 [terraform/eks/user_data.tf](../terraform/eks/user_data.tf)의 TOML이다. `motd`만 넣고 클러스터 접속 설정은 EKS 병합에 맡긴다. 병합 원리는 [2-concepts.md](2-concepts.md)의 설정 절에 있다
- `TF_VAR_admin_ssh_public_key`를 주면 admin container를 켜고 그 공개키를 등록한다. 주지 않으면 admin container는 꺼진 채로 뜬다

## 준비

준비물은 [1-scenario.md](1-scenario.md)의 준비물 절에 있다. kubectl이 추가로 필요하다.

8장의 경로 2(admin container SSH)를 할 계획이면 apply 전에 공개키를 넘긴다. 이미 떠 있는 노드그룹에 나중에 넘기면 launch template 버전이 바뀌어 노드가 교체된다.

```bash
export TF_VAR_admin_ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)"
```

## up

workspace 루트에서 init과 apply를 한 번에 실행한다. 클러스터 생성에 10~15분 걸린다.

```bash
terraform -chdir=terraform/eks init && terraform -chdir=terraform/eks apply -auto-approve
```

kubeconfig를 갱신하고 노드가 Ready인지 본다. `OS-IMAGE` 열에 `Bottlerocket OS 1.x.x (aws-k8s-1.36)`이 표시돼야 한다.

```bash
aws eks update-kubeconfig --name bottlerocket-1-36 --region ap-northeast-2
kubectl get nodes -o wide
```

## down

```bash
terraform -chdir=terraform/eks destroy -auto-approve
```

## 켜 둔 동안의 비용

| 대상 | 시간당 USD |
|---|---:|
| EKS 표준 지원 클러스터 | 0.10 |
| t4g.medium 1대 | 약 0.04 |
| EBS 24GiB(OS 4, 데이터 20), 공인 IPv4 1개 | 약 0.01 |

## 트러블슈팅

| 증상 | 원인 | 확인과 조치 |
|---|---|---|
| `init`이 모듈 다운로드 실패 | git 접근 불가 또는 ref 오타 | `git ls-remote https://github.com/choisungwook/terraform_practice.git v.1.35.5` |
| `apply`가 `no matching EC2 VPC found` | default VPC가 없다 | 콘솔 VPC 메뉴의 Actions에서 Create default VPC |
| 노드그룹 생성이 `NodeCreationFailure` | 노드가 클러스터에 조인하지 못했다 | 아래 "노드가 조인하지 않을 때" |
| `kubectl get nodes`가 `Unauthorized` | access entry의 principal과 kubectl의 자격 증명이 다르다 | `aws sts get-caller-identity`로 지금 자격 증명을 보고 apply한 profile과 맞춘다 |
| 노드가 `NotReady`로 남는다 | CNI 미설치 또는 조인 중 | `kubectl get pod -n kube-system`으로 aws-node가 Running인지 본다. 5분 넘으면 아래 절 |
| `OS-IMAGE`가 Amazon Linux | `ami_type`이 바뀌었다 | `terraform/eks/variables.tf`의 `ami_type` 기본값 |

## 노드가 조인하지 않을 때

Bottlerocket 노드가 조인하지 않는 가장 흔한 원인은 user data TOML 문법 오류다. AL2023과 달리 셸 스크립트가 아니라서 오타 하나로 설정 전체가 거부된다.

먼저 인스턴스를 찾고 그 인스턴스가 받은 user data를 본다. EKS가 `[settings.kubernetes]`를 붙였는지 여기서 확인한다.

```bash
INSTANCE_ID=$(aws ec2 describe-instances --region ap-northeast-2 \
  --filters Name=tag:eks:nodegroup-name,Values=bottlerocket Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[0].InstanceId' --output text)
aws ec2 describe-instance-attribute --region ap-northeast-2 --instance-id "$INSTANCE_ID" \
  --attribute userData --query 'UserData.Value' --output text | base64 -d
```

| 확인할 것 | 예상 |
|---|---|
| `[settings] motd` | launch template에 넣은 값 그대로 |
| `[settings.kubernetes]` | EKS가 붙인 `cluster-name`, `api-server`, `cluster-certificate` |

`[settings.kubernetes]`가 없으면 병합이 안 된 것이고, 있는데도 조인하지 않으면 TOML 오류나 네트워크다. 로그를 볼 수단은 시리얼 콘솔 출력과 SSM뿐이다.

```bash
aws ec2 get-console-output --region ap-northeast-2 --instance-id "$INSTANCE_ID" --latest --output text | tail -50
```

SSM 세션이 열리면 control container에서 API에 설정이 들어갔는지 본다. 병합 전 원본은 `terraform output bottlerocket_settings`에 있다.

```bash
aws ssm start-session --region ap-northeast-2 --target "$INSTANCE_ID"
apiclient get settings.motd settings.kubernetes.cluster-name
```

TOML을 고치기 전에 로컬 파서로 먼저 검사한다.

```bash
terraform -chdir=terraform/eks output -raw bottlerocket_settings > /tmp/user-data.toml
python3 -c 'import sys, tomllib; tomllib.load(open(sys.argv[1], "rb")); print("ok")' /tmp/user-data.toml
```
