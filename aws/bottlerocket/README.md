# Bottlerocket 원리와 긴급 접속, 운영 주의사항

SSH도 셸도 패키지 관리자도 없는 Bottlerocket 노드에 장애 때 어떻게 들어가는지, 들어가서 무엇을 할 수 없는지 정리한다. EKS 1.36 관리형 노드그룹과 EC2 단독 두 환경에서 실습한다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-concepts.md](docs/1-concepts.md) | 읽기 전용 루트 파일시스템, dm-verity, A/B 파티션, API 설정, host container |
| [2-setup-eks.md](docs/2-setup-eks.md) | EKS 1.36 + Bottlerocket 노드그룹 환경 up·down |
| [3-eks-emergency-access.md](docs/3-eks-emergency-access.md) | 긴급 접속 3가지 경로. SSM, admin container SSH, kubectl debug node |
| [4-setup-ec2.md](docs/4-setup-ec2.md) | EC2 단독 Bottlerocket 환경 up·down |
| [5-ec2-handson.md](docs/5-ec2-handson.md) | host 구조, 볼륨, apiclient 설정 지속 범위, A/B 업데이트와 롤백 |
| [6-cannot-do.md](docs/6-cannot-do.md) | SSH, 패키지 설치, 루트 파일시스템 쓰기, cron이 거부되는 방식 |
| [7-operations.md](docs/7-operations.md) | 업데이트 전략, 설정 영속화, 데이터 볼륨, SELinux, 에이전트, admin container 운영 |

## 실습 코드

- [terraform/eks/](terraform/eks/) — EKS 1.36 클러스터와 `BOTTLEROCKET_ARM_64` 관리형 노드그룹. [terraform_practice EKS 모듈](https://github.com/choisungwook/terraform_practice/tree/v.1.35.5/eks/module/eks) 사용
- [terraform/ec2/](terraform/ec2/) — `aws-k8s-1.36` 변형 AMI로 띄운 EC2 1대. SSM 접속만 연다
