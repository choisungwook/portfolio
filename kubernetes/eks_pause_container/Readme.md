# 개요
* 테라폼 puase pull 컨테이너 버그 재현
* [재현방법](./documents.md) 문서 바로가기

# EKS 생성 방법
* 테라폼 변수를 환경변수로 설정

```bash
# AWS IAM role
export TF_VAR_assume_role_arn=""
```

* 테라폼 코드 실행
```bash
terraform init
terraform plan
terraform apply # 약 15~20분 소요
````

* kubeconfig 생성

```bash
# kubeconfig 생성
aws eks update-kubeconfig --region ap-northeast-2 --name pause-container

# cluster 확인
kubectl cluster-info
```

* kubeconfig 업데이트는 아래 명령어를 사용

```sh
aws eks update-kubeconfig --region ap-northeast-2 --name demo
```

# 업그레이드 전 준비
* karpenter를 배포하고 karpenter로 노드 생성

# 참고자료
* https://github.com/awslabs/amazon-eks-ami/issues/1597
* https://github.com/awslabs/amazon-eks-ami/releases/tag/v20240202
