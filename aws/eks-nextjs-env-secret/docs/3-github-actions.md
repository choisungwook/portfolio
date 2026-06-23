# GitHub Actions는 왜 build와 deploy를 분리해야 할까

Next.js image를 만들고 EKS에 배포하는 일을 한 job에 몰아넣을 수 있습니다. 그런데 build-time env와 runtime Secret의 책임이 다르다면, CI/CD도 그 경계를 나눠야 하지 않을까요?

## build job은 무엇만 알아야 하나

build job은 Docker image를 만들고 ECR에 push합니다. 이때 필요한 값은 image build에 들어갈 public build-time env와 ECR push 권한입니다.

`NEXT_PUBLIC_BUILD_ENV_NAME` 같은 값은 browser bundle에 들어갈 수 있으므로 Secret으로 취급하면 안 됩니다. 장점은 사용자가 보는 build 식별자나 public API endpoint를 명확하게 고정할 수 있다는 점입니다. 단점은 build 후에는 Kubernetes env로 바꿀 수 없다는 점입니다.

예제 workflow는 아래 위치에 있습니다.

```text
aws/eks-nextjs-env-secret/github-actions/eks-nextjs-env-secret.yml
```

## deploy job은 무엇만 알아야 하나

deploy job은 EKS kubeconfig를 설정하고 manifest를 적용합니다. 애플리케이션 Secret value는 GitHub Actions secret에 넣지 않습니다. 대신 EKS 안의 External Secrets Operator가 AWS Secrets Manager에서 읽습니다.

이 방식의 장점은 CI/CD log와 workflow input에 애플리케이션 Secret 원문이 지나가지 않는다는 점입니다. 단점은 EKS cluster 쪽에 External Secrets Operator와 IAM role이 미리 준비되어 있어야 한다는 점입니다.

## OIDC 권한은 어떻게 나눌까

예제 workflow는 `permissions`를 최소화합니다.

```yaml
permissions:
  contents: read
  id-token: write
```

`id-token: write`는 GitHub Actions OIDC로 AWS role을 assume하기 위해 필요합니다. build role은 ECR push 권한만 갖고, deploy role은 EKS 배포에 필요한 권한만 갖는 방향이 좋습니다.

권한을 나누는 장점은 build job이 cluster-admin에 가까운 권한을 갖지 않아도 된다는 점입니다. 단점은 IAM role과 trust policy가 늘어나므로 처음 설정이 번거롭다는 점입니다.

## Secret rotation은 workflow에서 무엇을 해야 하나

Secret 원문을 바꾸는 일은 GitHub Actions workflow가 아니라 AWS Secrets Manager 쪽 작업입니다. workflow는 새 image를 배포하거나, Secret 변경 후 애플리케이션 Pod를 새로 띄우는 rollout을 수행합니다.

```bash
kubectl rollout restart deployment/nextjs-env-secret-demo -n nextjs-env-secret
kubectl rollout status deployment/nextjs-env-secret-demo -n nextjs-env-secret
```

release마다 Secret version을 고정하려면 workflow input에 Secret version id를 받고 ExternalSecret manifest의 `remoteRef.version`을 `uuid/<version-id>`로 바꾸는 방식을 검토할 수 있습니다. 이 방식은 재현성이 좋아지는 장점이 있지만, 운영자가 version id를 관리해야 하는 단점이 있습니다.

## 정리

정리하면, build와 deploy를 분리하는 이유는 Next.js build-time env와 EKS runtime Secret의 책임이 다르기 때문입니다. build job은 public build 값을 image에 고정하고, deploy job은 EKS에 그 image를 배포하며, Secret 원문은 AWS Secrets Manager와 External Secrets Operator 경로에 남겨두는 구조가 안전합니다.

## 참고자료

- [GitHub Actions OIDC in AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [AWS ECR GitHub Actions login action](https://github.com/aws-actions/amazon-ecr-login)
