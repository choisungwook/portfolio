# EKS 실습 환경

EKS 1.36 클러스터와 Bottlerocket 관리형 노드그룹(t4g.medium 1대)을 만든다. EKS 모듈은 [terraform_practice의 eks/module/eks](https://github.com/choisungwook/terraform_practice/tree/v.1.35.5/eks/module/eks) v.1.35.5를 쓴다.

## 만들어지는 것

| 리소스 | 값 |
|---|---|
| EKS 클러스터 | `bottlerocket-1-36`, 1.36, default VPC |
| addon | vpc-cni, kube-proxy, coredns. EKS가 self-managed로 설치 |
| 관리형 노드그룹 | `bottlerocket`, `BOTTLEROCKET_ARM_64`, t4g.medium 1대 |
| 노드 IAM role | 모듈 기본. SSM, ECR 읽기, CNI, worker 정책 포함 |
| access entry | terraform을 실행한 IAM role에 cluster admin |

- launch template user data는 [terraform/eks/user_data.tf](../terraform/eks/user_data.tf)의 TOML이다. `motd`만 넣고 클러스터 접속 설정은 EKS 병합에 맡긴다
- `TF_VAR_admin_ssh_public_key`를 주면 admin container를 켜고 그 공개키를 등록한다. 주지 않으면 admin container는 꺼진 채로 뜬다

## 준비

- Terraform 1.11 이상, AWS CLI v2, session-manager-plugin, kubectl
- ap-northeast-2 default VPC
- 관리자 권한 AWS profile

admin container SSH 실습(경로 2)을 할 때만 공개키를 넘긴다. 이미 떠 있는 노드그룹에 나중에 넘기면 launch template 버전이 바뀌어 노드가 교체된다.

```bash
export TF_VAR_admin_ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)"
```

## up

workspace 루트에서 init과 apply를 한 번에 실행한다. 클러스터 생성에 10~15분 걸린다.

```bash
terraform -chdir=terraform/eks init && terraform -chdir=terraform/eks apply -auto-approve
```

kubeconfig를 갱신하고 노드가 Ready인지 본다. `OS-IMAGE` 열에 Bottlerocket이 보여야 한다.

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
