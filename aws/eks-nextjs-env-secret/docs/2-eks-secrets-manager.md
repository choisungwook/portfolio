# EKS에서는 왜 Secret 값을 GitHub Actions에 두지 않아도 될까

EKS에 배포할 때 가장 쉬운 방법은 GitHub Actions secret에 애플리케이션 Secret 값을 넣고 manifest에 주입하는 것입니다. 그런데 이 방식은 CI/CD가 애플리케이션 Secret 원문을 알게 만듭니다. Secret 원문을 Actions 밖에 둘 수는 없을까요?

## 어떤 구조를 사용할까

이 예제는 AWS Secrets Manager를 Secret 원본으로 두고, External Secrets Operator가 EKS 안의 Kubernetes Secret으로 동기화하는 구조를 사용합니다.

흐름은 아래와 같습니다.

```text
AWS Secrets Manager
  -> External Secrets Operator
  -> Kubernetes Secret
  -> Deployment env
  -> Next.js server runtime
```

장점은 GitHub Actions가 애플리케이션 Secret 원문을 몰라도 된다는 점입니다. 단점은 External Secrets Operator, IAM role, SecretStore 설정이 추가되어 운영 요소가 늘어난다는 점입니다.

## Terraform은 무엇을 만들까

Terraform 예제는 EKS cluster를 만들지 않습니다. 이미 있는 EKS cluster에서 아래 리소스만 만듭니다.

- AWS Secrets Manager Secret
- Secret을 읽을 수 있는 IAM policy
- External Secrets Operator service account가 사용할 IAM role

민감값은 예시 파일에 넣지 않습니다. `terraform.tfvars`는 로컬에서만 만들고 commit하지 않습니다.

```bash
cd aws/eks-nextjs-env-secret/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

`terraform apply` 후 출력되는 `external_secrets_role_arn`을 External Secrets Operator service account에 annotation으로 연결합니다. 실제 설치 방식은 Helm chart 설정에 따라 달라질 수 있어서 cluster 설치값은 확인 필요입니다.

## ExternalSecret은 어떤 Secret version을 읽을까

External Secrets Operator의 AWS Secrets Manager provider는 `remoteRef.version`으로 version stage 또는 version id를 지정할 수 있습니다. `AWSCURRENT`를 지정하면 현재 stage가 가리키는 Secret version을 읽습니다. `uuid/<version-id>` 형식이면 특정 VersionId를 읽습니다.

이 예제 manifest는 `AWSCURRENT`를 사용합니다.

```yaml
remoteRef:
  key: eks-nextjs-env-secret/demo
  property: RUNTIME_SECRET_TOKEN
  version: AWSCURRENT
```

장점은 Secret rotation 후 `AWSCURRENT` stage만 옮기면 External Secrets Operator가 새 값을 따라간다는 점입니다. 단점은 배포 단위가 특정 Secret version에 고정되지 않기 때문에, 값 변경과 애플리케이션 rollout 시점의 관계를 별도로 관리해야 한다는 점입니다.

특정 배포 버전에 Secret 값을 고정하려면 `uuid/<version-id>`를 쓰는 방법이 있습니다. 장점은 release가 어떤 Secret version을 읽는지 명확하다는 점입니다. 단점은 매 release마다 manifest나 배포 파라미터를 갱신해야 한다는 점입니다.

## Secret이 동기화되면 기존 Pod는 바로 바뀔까

External Secrets Operator가 Kubernetes Secret을 새 값으로 갱신해도, env로 주입된 기존 Pod의 프로세스 환경변수는 바로 바뀌지 않습니다. 새 값을 애플리케이션에 반영하려면 Deployment rollout이 필요합니다.

```bash
kubectl rollout restart deployment/nextjs-env-secret-demo -n nextjs-env-secret
kubectl rollout status deployment/nextjs-env-secret-demo -n nextjs-env-secret
```

이 방식의 장점은 Secret 변경만으로 예기치 않은 runtime 변경이 즉시 발생하지 않는다는 점입니다. 단점은 rotation 후 rollout을 놓치면 애플리케이션이 오래된 Secret을 계속 사용할 수 있다는 점입니다.

## EKS manifest 적용 순서

이미 ECR에 image가 있고 External Secrets Operator가 설치되어 있다고 가정합니다.

먼저 namespace와 SecretStore, ExternalSecret을 적용합니다.

```bash
cd aws/eks-nextjs-env-secret
kubectl apply -f manifests/eks/namespace.yaml
kubectl apply -f manifests/eks/secret-store.yaml.template
kubectl apply -f manifests/eks/external-secret.yaml.template
```

Secret 동기화 상태를 확인합니다.

```bash
kubectl get externalsecret -n nextjs-env-secret
kubectl get secret nextjs-runtime-secret -n nextjs-env-secret
```

이미지 주소를 실제 ECR 주소로 바꿔 Deployment를 적용합니다.

```bash
sed "s#<aws-account-id>.dkr.ecr.ap-northeast-2.amazonaws.com/eks-nextjs-env-secret:<image-tag>#123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/eks-nextjs-env-secret:demo#g" \
  manifests/eks/deployment.yaml.template \
  > /tmp/nextjs-env-secret-deployment.yaml

kubectl apply -f manifests/eks/configmap.yaml.template
kubectl apply -f /tmp/nextjs-env-secret-deployment.yaml
kubectl apply -f manifests/eks/service.yaml
kubectl rollout status deployment/nextjs-env-secret-demo -n nextjs-env-secret
```

## 정리

정리하면, Secret 값을 GitHub Actions에 두지 않아도 되는 이유는 CI/CD가 Secret 원문을 전달하는 대신 EKS 안의 controller가 AWS Secrets Manager에서 값을 읽기 때문입니다. 대신 IAM, External Secrets Operator, rollout 정책을 함께 운영해야 하므로 단순한 manifest env보다 구성 요소가 많아집니다.

## 참고자료

- [External Secrets Operator AWS Secrets Manager provider](https://external-secrets.io/latest/provider/aws-secrets-manager/)
- [AWS Secrets Manager version stages](https://docs.aws.amazon.com/secretsmanager/latest/userguide/getting-started.html)
