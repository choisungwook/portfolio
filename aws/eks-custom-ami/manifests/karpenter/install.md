# Karpenter Helm 설치 가이드

## 사전 요구사항

- EKS 클러스터가 배포된 상태
- `terraform/eks.tf`에서 `karpenter_enabled = true`로 설정 후 `terraform apply` 완료
- Helm, envsubst 설치

## Step 1: 환경변수 설정

AWS CLI로 클러스터 정보와 AMI ID를 조회해서 환경변수를 설정합니다.

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
```

Default VPC의 subnet ID와 클러스터 security group ID를 조회합니다.

```bash
# Default VPC subnet ID 조회
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=default-for-az,Values=true" \
  --query "Subnets[].SubnetId" --output text)
export SUBNET_ID_A=$(echo $SUBNET_IDS | awk '{print $1}')
export SUBNET_ID_B=$(echo $SUBNET_IDS | awk '{print $2}')
export SUBNET_ID_C=$(echo $SUBNET_IDS | awk '{print $3}')
export SUBNET_ID_D=$(echo $SUBNET_IDS | awk '{print $4}')

# EKS 클러스터 security group ID 조회
export CLUSTER_SECURITY_GROUP_ID=$(aws eks describe-cluster \
  --name "${CLUSTER_NAME}" \
  --query "cluster.resourcesVpcConfig.clusterSecurityGroupId" \
  --output text)
```

환경변수가 올바르게 설정되었는지 확인합니다. 값이 비어있으면 envsubst가 빈 문자열로 치환되어 매니페스트 오류가 발생합니다.

```bash
echo "CLUSTER_NAME: ${CLUSTER_NAME}"
echo "KARPENTER_ROLE_ARN: ${KARPENTER_ROLE_ARN}"
echo "CUSTOM_AMI_ID: ${CUSTOM_AMI_ID}"
echo "SUBNET_ID_A: ${SUBNET_ID_A}"
echo "SUBNET_ID_B: ${SUBNET_ID_B}"
echo "SUBNET_ID_C: ${SUBNET_ID_C}"
echo "SUBNET_ID_D: ${SUBNET_ID_D}"
echo "CLUSTER_SECURITY_GROUP_ID: ${CLUSTER_SECURITY_GROUP_ID}"

# 검증: 비어있는 변수가 있으면 중단
for var in CLUSTER_NAME KARPENTER_ROLE_ARN CUSTOM_AMI_ID SUBNET_ID_A SUBNET_ID_B SUBNET_ID_C SUBNET_ID_D CLUSTER_SECURITY_GROUP_ID; do
  if [ -z "${!var}" ] || [ "${!var}" = "None" ]; then
    echo "ERROR: ${var} is empty or None. Check AWS CLI output."
    exit 1
  fi
done
echo "All variables are set."
```

## Step 2: Karpenter Helm 설치

Karpenter를 설치합니다.

```bash
helm registry logout public.ecr.aws

helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter \
  --version "${KARPENTER_VERSION}" \
  --namespace karpenter --create-namespace \
  -f values.yaml \
  --set "settings.clusterName=${CLUSTER_NAME}" \
  --set "settings.interruptionQueue=${CLUSTER_NAME}" \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=${KARPENTER_ROLE_ARN}" \
  --wait
```

설치 확인합니다.

```bash
kubectl get pods -n karpenter
```

## Step 3: envsubst로 매니페스트 생성

template 파일에서 환경변수를 치환하여 `examples/` 디렉터리에 매니페스트를 생성합니다. `envsubst`에 변수 목록을 명시해야 의도하지 않은 치환을 방지할 수 있습니다.

```bash
envsubst '${CUSTOM_AMI_ID} ${CLUSTER_NAME} ${SUBNET_ID_A} ${SUBNET_ID_B} ${SUBNET_ID_C} ${SUBNET_ID_D} ${CLUSTER_SECURITY_GROUP_ID}' \
  < ec2nodeclass.yaml.template > examples/ec2nodeclass.yaml
cp nodepool.yaml.template examples/nodepool.yaml
cp inflate.yaml.template examples/inflate.yaml
```

생성된 파일에서 AMI ID가 올바르게 치환되었는지 확인합니다.

```bash
grep "id:" examples/ec2nodeclass.yaml
```

## Step 4: EC2NodeClass + NodePool 적용

생성된 매니페스트를 적용합니다.

```bash
kubectl apply -f examples/
```

리소스가 생성되었는지 확인합니다.

```bash
kubectl get ec2nodeclass
kubectl get nodepool
```

## Step 5: 테스트

`kubectl apply -f examples/`에서 inflate deployment가 함께 배포됩니다. CPU 2코어를 요청하므로 기존 managed node group에 스케줄링되지 않고 Karpenter가 새 노드를 프로비저닝합니다.

노드가 추가되는지 확인합니다.

```bash
kubectl get nodes -w
```

Karpenter 로그로 프로비저닝 과정을 확인할 수 있습니다.

```bash
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter -f
```

## Step 6: 정리

테스트가 끝나면 리소스를 삭제합니다.

```bash
kubectl delete -f examples/
helm uninstall karpenter -n karpenter
```
