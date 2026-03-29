# EKS Custom AMI

## 개요

AWS EKS optimized AMI(AL2023, x86_64)를 base로 추가 패키지를 설치한 커스텀 AMI를 Packer로 빌드하는 프로젝트입니다. EKS optimized AMI에는 kubelet, containerd, nodeadm이 이미 포함되어 있어서, 필요한 패키지만 추가하면 됩니다.

커스텀 AMI를 Managed Node Group과 Karpenter 두 가지 방식으로 EKS 클러스터에 적용하고, 각각의 NodeConfig 처리 방식 차이를 확인합니다.

## 실습 가이드

전체 실습 과정은 **[hands-on.md](./docs/hands-on.md)** 를 따라가면 됩니다. 순서는 아래와 같습니다.

1. Packer로 커스텀 AMI 빌드
2. Terraform으로 EKS 클러스터 + Managed Node Group 배포
3. 커스텀 AMI 노드가 클러스터에 조인되는지 확인
4. Karpenter를 설치하고 커스텀 AMI로 노드를 프로비저닝
5. 리소스 정리

## 문서 목차

| 문서 | 설명 |
|------|------|
| [hands-on.md](./docs/hands-on.md) | 전체 실습 가이드 (Packer → EKS → Karpenter) |
| [concepts.md](./docs/concepts.md) | nodeadm과 커스텀 AMI 노드 조인 과정 |
| [find-eks-ami.md](./docs/find-eks-ami.md) | EKS optimized AMI 찾는 방법 (SSM, CLI, 콘솔) |
| [for-future-agents.md](./docs/for-future-agents.md) | Agent 설계 판단, 검증 상태, 변경 이력 |

## 파일 구조

| 파일/디렉터리 | 설명 |
|---|---|
| `packer/` | Packer 템플릿, 변수, 빌드 스크립트 |
| `terraform/` | EKS 1.35 클러스터 배포 Terraform 구성 |
| `manifests/` | Karpenter Helm values, EC2NodeClass, NodePool 템플릿 |
| `docs/` | 상세 문서 |
