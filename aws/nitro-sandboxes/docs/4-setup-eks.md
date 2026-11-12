# EKS Auto Mode 실습 환경

시나리오 5가 쓰는 환경입니다. 실습 전용 VPC에 EKS 1.37 Auto Mode 클러스터를 만듭니다. 노드는 pod을 만들 때 Auto Mode가 띄웁니다.

## 만들어지는 것

| 리소스 | 값 |
|---|---|
| 리전 | `us-west-2`. EKS의 isolated, confidential pod은 US 상용 리전에서만 제공됩니다 |
| VPC | `terraform-aws-modules/vpc/aws` 6.7, `10.20.0.0/16`, public 2개, private 2개, NAT gateway 1개 |
| EKS | `terraform-aws-modules/eks/aws` 21.29, Kubernetes 1.37, Auto Mode(`general-purpose`, `system` node pool) |
| API endpoint | public 접근을 내 공인 IP `/32`로만 제한 |
| 접근 권한 | `terraform apply`를 실행한 IAM 주체에 cluster admin access entry |
| EKS add-on | `metrics-server` v0.9.0-eksbuild.14, `amazon-cloudwatch-observability` v7.0.1-eksbuild.1 |
| IAM | `nitro-sandbox-cloudwatch-agent` role(`CloudWatchAgentServerPolicy`)을 Pod Identity로 `amazon-cloudwatch/cloudwatch-agent`에 연결 |

선택 이유는 다음과 같습니다.

- Kubernetes 1.36 이상이어야 `isolated-sandbox`, `confidential-sandbox` RuntimeClass가 동작합니다.
- Auto Mode는 Nitro Sandbox runtime이 들어간 노드를 직접 준비합니다. 관리형 노드그룹을 쓰면 runtime을 넣은 커스텀 AMI를 빌드하고 launch template에서 Nitro Enclaves를 켜야 합니다.
- Auto Mode 노드는 private subnet에 뜨므로 이미지 pull을 위해 NAT gateway를 둡니다.
- 시나리오 6에서 `kubectl top`과 CloudWatch(Logs, Container Insights)로 sandbox pod을 관측하려고 add-on 두 개를 넣습니다. CloudWatch agent와 Fluent Bit는 모두 `cloudwatch-agent` service account를 씁니다.

## up

workspace 루트(`aws/nitro-sandboxes`)에서 실행합니다. 15분 안팎 걸립니다.

```bash
terraform -chdir=terraform/eks init
terraform -chdir=terraform/eks apply -auto-approve
$(terraform -chdir=terraform/eks output -raw kubeconfig_command)
```

## 접속 확인

Auto Mode는 workload pod이 없으면 노드를 띄우지 않으므로, 처음에는 노드가 0개여도 정상입니다. RuntimeClass가 있는지 확인합니다.

```bash
kubectl get nodes
kubectl get runtimeclass
```

공인 IP가 바뀌면 `kubectl`이 timeout으로 멈춥니다. `apply`를 다시 실행하면 endpoint 허용 CIDR이 새 IP로 바뀝니다.

## down

pod을 먼저 지워 Auto Mode가 노드를 회수하게 한 뒤 destroy합니다. Auto Mode가 띄운 EC2는 Terraform state에 없어서, pod이 남아 있으면 노드가 정리될 때까지 destroy가 subnet 삭제에서 기다립니다.

```bash
kubectl delete namespace ai-agent --ignore-not-found
kubectl delete -f manifests/ --ignore-not-found
terraform -chdir=terraform/eks destroy -auto-approve
```

남은 리소스가 없는지 확인합니다. 두 명령 모두 빈 결과가 나와야 합니다.

```bash
aws resourcegroupstaggingapi get-resources --region us-west-2 \
  --tag-filters Key=Project,Values=nitro-sandboxes-eks \
  --query 'ResourceTagMappingList[].ResourceARN'
aws ec2 describe-instances --region us-west-2 \
  --filters Name=tag:eks:eks-cluster-name,Values=nitro-sandbox Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[].Instances[].InstanceId'
```

CloudWatch agent가 만든 Container Insights log group 4개는 Terraform state에 없어서 destroy 뒤에도 남습니다. 직접 지웁니다.

```bash
for g in application dataplane host performance; do
  aws logs delete-log-group --region us-west-2 --log-group-name /aws/containerinsights/nitro-sandbox/$g
done
```

EKS 모듈이 secret 암호화용으로 만든 KMS key는 바로 지워지지 않고 30일 동안 `PendingDeletion` 상태로 남습니다. 이 상태의 key는 요금이 나오지 않습니다. tagging API는 삭제된 리소스를 한동안 계속 보여 주므로, 결과에 ARN이 남으면 그 리소스를 직접 조회해 상태를 확인합니다.
