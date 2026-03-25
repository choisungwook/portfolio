# 커스텀 AMI로 EKS 노드 조인 실습

## 목차

- [공부 배경](#공부-배경)
- [이 글을 읽고 답할 수 있는 질문](#이-글을-읽고-답할-수-있는-질문)
- [사전 요구사항](#사전-요구사항)
- [Step 1: Packer로 커스텀 AMI 빌드](#step-1-packer로-커스텀-ami-빌드)
- [Step 2: AMI ID 확인](#step-2-ami-id-확인)
- [Step 3: Terraform으로 EKS 배포](#step-3-terraform으로-eks-배포)
- [Step 4: 노드 조인 확인](#step-4-노드-조인-확인)
- [Step 5: Karpenter로 커스텀 AMI 테스트](#step-5-karpenter로-커스텀-ami-테스트)
- [Step 6: 정리](#step-6-정리)
- [결론](#결론)
- [참고자료](#참고자료)

## 공부 배경

EKS managed node group은 기본적으로 AWS가 제공하는 EKS optimized AMI를 사용합니다. 대부분의 경우 이 기본 AMI로 충분하지만, 회사 보안 정책에 따라 추가 패키지를 설치하거나 OS 설정을 변경해야 할 때가 있습니다.

이때 Packer로 커스텀 AMI를 빌드하고, 그 AMI를 EKS node group에 적용하는 방법을 알아야 합니다. **이 글은 Packer로 빌드한 커스텀 AMI가 EKS 클러스터에 정상적으로 조인되는지 확인하는 실습입니다.**

## 이 글을 읽고 답할 수 있는 질문

- Packer로 빌드한 커스텀 AMI를 EKS managed node group에 어떻게 적용하나요?
- 커스텀 AMI를 사용할 때 `release_version` 대신 무엇을 설정하나요?
- 커스텀 AMI 노드가 EKS 클러스터에 조인되었는지 어떻게 확인하나요?

## 사전 요구사항

- Packer >= 1.9
- Terraform >= 1.11
- AWS CLI 설정 완료
- kubectl 설치

## Step 1: Packer로 커스텀 AMI 빌드

Packer 프로젝트 디렉터리로 이동합니다.

```bash
cd aws/eks-custom-ami/packer
```

Packer 플러그인을 초기화하고 빌드합니다.

```bash
packer init .
packer build .
```

빌드가 완료되면 AMI ID가 출력됩니다. 이 값을 다음 단계에서 사용합니다.

변수 오버라이딩이 필요하면 [Packer 공식 문서](https://developer.hashicorp.com/packer/docs/templates/hcl_templates/variables)를 참고하세요.

## Step 2: AMI ID 확인

Packer 빌드가 완료되면 마지막 줄에 AMI ID가 출력됩니다.

```
==> Builds finished. The artifacts of successful builds are:
--> eks-custom-ami.amazon-ebs.eks: AMIs were created:
ap-northeast-2: ami-0123456789abcdef0
```

이 AMI ID를 복사합니다. Terraform 배포 시 환경변수로 전달해야 합니다.

빌드 로그를 놓쳤다면 AWS CLI로도 확인할 수 있습니다.

```bash
aws ec2 describe-images \
  --owners self \
  --filters "Name=name,Values=eks-custom-ami-1.35-*" \
  --query "Images | sort_by(@, &CreationDate) | [-1].{ImageId:ImageId, Name:Name, CreationDate:CreationDate}" \
  --output table
```

결과가 비어 있으면 Packer 빌드가 완료되지 않은 것입니다. Step 1을 먼저 실행하세요.

## Step 3: Terraform으로 EKS 배포

Terraform 디렉터리로 이동합니다.

```bash
cd aws/eks-custom-ami/terraform
```

환경변수를 설정합니다. `TF_VAR_custom_ami_id`에 Step 2에서 확인한 AMI ID를 넣습니다.

```bash
export TF_VAR_assume_role_arn="arn:aws:iam::XXXXXXXXXXXX:role/your-role"
export TF_VAR_custom_ami_id="ami-xxxx"
```

Terraform을 초기화하고 배포합니다.

```bash
terraform init
terraform plan
terraform apply
```

EKS 클러스터 생성에는 시간이 걸립니다. 완료될 때까지 기다립니다.

### 커스텀 AMI는 어떻게 적용되나요?

`eks.tf`의 managed node group 설정을 보면, 기존 예제와 다른 점이 하나 있습니다.

기존 EKS 예제에서는 `release_version`으로 AWS 공식 AMI 버전을 지정했습니다.

```hcl
# 기존 방식: AWS 공식 AMI
managed_node_groups = {
  "managed-node-group-a" = {
    release_version = "1.33.0-20250519"
    # ...
  }
}
```

커스텀 AMI를 사용할 때는 `release_version` 대신 `ami_id`를 설정합니다.

```hcl
# 커스텀 AMI 방식
managed_node_groups = {
  "custom-ami-node-group" = {
    ami_id = var.custom_ami_id
    # ...
  }
}
```

**`ami_id`가 설정되면 EKS 모듈이 자동으로 `release_version`을 null 처리합니다.** 따라서 두 값을 동시에 설정할 필요가 없습니다.

## Step 4: 노드 조인 확인

kubeconfig를 업데이트합니다.

```bash
aws eks update-kubeconfig --name eks-custom-ami-1-35 --region ap-northeast-2
```

노드가 정상적으로 조인되었는지 확인합니다.

```bash
kubectl get nodes
```

노드 상태가 `Ready`이면 커스텀 AMI가 정상적으로 동작하는 것입니다.

노드의 상세 정보에서 AMI ID를 확인할 수 있습니다.

```bash
kubectl describe node <node-name> | grep "ProviderID"
```

EC2 콘솔에서도 해당 인스턴스의 AMI가 커스텀 AMI인지 확인할 수 있습니다.

## Step 5: Karpenter로 커스텀 AMI 테스트

Managed Node Group에서는 커스텀 AMI 사용 시 user data에 NodeConfig를 직접 넣어야 했습니다. Karpenter는 어떨까요? `amiFamily: AL2023`을 설정하면 Karpenter가 NodeConfig를 자체 생성하는지 확인합니다.

### Karpenter IRSA 활성화

`terraform/eks.tf`에서 `karpenter_enabled = true`로 변경하고 적용합니다.

```bash
cd aws/eks-custom-ami/terraform
terraform apply
```

### Karpenter Helm 설치

Karpenter Helm 설치와 매니페스트 적용 절차는 [manifests/karpenter/install.md](../manifests/karpenter/install.md)를 참고합니다.

환경변수를 설정하고 AWS CLI로 필요한 값을 조회합니다.

```bash
export CLUSTER_NAME="eks-custom-ami-1-35"
export KARPENTER_VERSION="1.10.0"
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export KARPENTER_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${CLUSTER_NAME}-karpenter-irsa"
export CUSTOM_AMI_ID=$(aws ec2 describe-images \
  --owners self \
  --filters "Name=name,Values=eks-custom-ami-1.35-*" \
  --query "Images | sort_by(@, &CreationDate) | [-1].ImageId" \
  --output text)

# Default VPC subnet/security group 조회
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=default-for-az,Values=true" \
  --query "Subnets[].SubnetId" --output text)
export SUBNET_ID_A=$(echo $SUBNET_IDS | awk '{print $1}')
export SUBNET_ID_B=$(echo $SUBNET_IDS | awk '{print $2}')
export SUBNET_ID_C=$(echo $SUBNET_IDS | awk '{print $3}')
export SUBNET_ID_D=$(echo $SUBNET_IDS | awk '{print $4}')
export CLUSTER_SECURITY_GROUP_ID=$(aws eks describe-cluster \
  --name "${CLUSTER_NAME}" \
  --query "cluster.resourcesVpcConfig.clusterSecurityGroupId" \
  --output text)
```

포트폴리오 루트 디렉터리에서 Helm으로 Karpenter를 설치합니다.

```bash
cd <portfolio-root>
helm registry logout public.ecr.aws
helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter \
  --version "${KARPENTER_VERSION}" \
  --namespace karpenter --create-namespace \
  -f aws/eks-custom-ami/manifests/karpenter/values.yaml \
  --set "settings.clusterName=${CLUSTER_NAME}" \
  --set "settings.interruptionQueue=${CLUSTER_NAME}" \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=${KARPENTER_ROLE_ARN}" \
  --wait
```

Karpenter Pod가 정상 실행되는지 확인합니다.

```bash
kubectl get pods -n karpenter
```

### EC2NodeClass + NodePool 적용

envsubst로 template에서 매니페스트를 생성하고 적용합니다.

```bash
cd aws/eks-custom-ami/manifests/karpenter
envsubst '${CUSTOM_AMI_ID} ${CLUSTER_NAME} ${SUBNET_ID_A} ${SUBNET_ID_B} ${SUBNET_ID_C} ${SUBNET_ID_D} ${CLUSTER_SECURITY_GROUP_ID}' \
  < ec2nodeclass.yaml.template > examples/ec2nodeclass.yaml
cp nodepool.yaml.template examples/nodepool.yaml
cp inflate.yaml.template examples/inflate.yaml
kubectl apply -f examples/
```

### 노드 조인 확인

`examples/`에 포함된 inflate deployment(CPU 2코어 요청)가 Karpenter 노드 프로비저닝을 트리거합니다.

Karpenter가 새 노드를 프로비저닝하고 클러스터에 조인시키는지 확인합니다.

```bash
kubectl get nodes -w
```

노드가 `Ready` 상태가 되면 커스텀 AMI가 적용되었는지 확인합니다.

```bash
kubectl get nodes -o wide
```

Karpenter 로그에서 NodeConfig 생성 과정을 확인할 수 있습니다.

```bash
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter -f
```

### 정리

테스트 리소스를 삭제합니다.

```bash
kubectl delete -f examples/
```

## Step 6: 정리

실습이 끝나면 리소스를 삭제합니다.

```bash
cd aws/eks-custom-ami/terraform
terraform destroy
```

## 결론

Packer로 빌드한 커스텀 AMI를 EKS에서 사용하는 핵심은 NodeConfig 처리 방식을 이해하는 것입니다.

- **Managed Node Group**: 커스텀 AMI 사용 시 AWS가 NodeConfig를 자동 주입하지 않습니다. launch template user data에 NodeConfig를 직접 넣어야 합니다. 이 프로젝트의 EKS 모듈은 `ami_id`가 설정되면 NodeConfig를 자동 생성합니다.
- **Karpenter**: `amiFamily: AL2023`으로 설정하면 Karpenter가 NodeConfig를 자체 생성합니다. user data를 별도로 작성할 필요가 없습니다.

## 참고자료

- <https://docs.aws.amazon.com/eks/latest/userguide/launch-templates.html>
- <https://docs.aws.amazon.com/eks/latest/userguide/create-managed-node-group.html>
- <https://developer.hashicorp.com/packer/docs>
