# Bottlerocket 입문 핸즈온: 원리, 접속, 설정, 업데이트, EKS 긴급 접속

SSH도 셸도 패키지 관리자도 없는 Bottlerocket 노드를 처음 맡은 사람이 따라가는 순서로 정리한다. EC2 단독 1대에서 host 구조, 거부되는 작업, 설정 지속 범위, A/B 업데이트를 먼저 익히고, EKS 1.36 노드그룹에서 kubelet을 멈춘 NotReady 노드에 3가지 경로로 들어가 본다. 실습 문서는 원리, 실습, 트러블슈팅, 정리 순서로 같은 구조다.

## 문서

읽는 순서와 용어, 준비물은 [1-scenario.md](docs/1-scenario.md)에 있다.

| 문서 | 환경 | 내용 |
|---|---|---|
| [1-scenario.md](docs/1-scenario.md) | 없음 | 처음 만나는 상황, 답하는 질문, 읽는 순서, 용어, 준비물 |
| [2-concepts.md](docs/2-concepts.md) | 없음 | 변형, host container, API 설정, 읽기 전용 루트와 dm-verity, 볼륨, A/B 파티션 |
| [3-setup-ec2.md](docs/3-setup-ec2.md) | EC2 | EC2 단독 Bottlerocket 환경 up·down, 트러블슈팅 |
| [4-first-access.md](docs/4-first-access.md) | EC2 | SSM → control → admin → host 3층 접속. 층마다 위치 확인 |
| [5-cannot-do.md](docs/5-cannot-do.md) | EC2 | SSH, 패키지 설치, 루트 쓰기, cron이 거부되는 방식과 대안 |
| [6-settings-and-update.md](docs/6-settings-and-update.md) | EC2 | apiclient set 지속 범위, /etc와 /local, A/B 업데이트와 롤백 |
| [7-setup-eks.md](docs/7-setup-eks.md) | EKS | EKS 1.36 + Bottlerocket 노드그룹 up·down, 노드 조인 실패 진단 |
| [8-eks-emergency-access.md](docs/8-eks-emergency-access.md) | EKS | kubelet을 멈춘 NotReady 노드에서 SSM, admin SSH, kubectl debug node 비교 |
| [9-operations.md](docs/9-operations.md) | 없음 | 업데이트 전략, 설정 영속화, 데이터 볼륨, SELinux, 에이전트, admin container 운영 |

## 실습 코드

- [terraform/ec2/](terraform/ec2/) — `aws-k8s-1.36` 변형 AMI로 띄운 EC2 1대. SSM 접속만 연다
- [terraform/eks/](terraform/eks/) — EKS 1.36 클러스터와 `BOTTLEROCKET_ARM_64` 관리형 노드그룹. [terraform_practice EKS 모듈](https://github.com/choisungwook/terraform_practice/tree/v.1.35.5/eks/module/eks) 사용
