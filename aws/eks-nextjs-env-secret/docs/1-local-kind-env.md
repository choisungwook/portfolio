# local kind에서는 왜 build-time env와 runtime env가 다르게 보일까

Next.js 이미지를 한 번 빌드한 뒤 Kubernetes env만 바꿨는데, 브라우저 화면의 값은 그대로인 경우가 있습니다. 서버가 읽는 값은 바뀌는데 왜 브라우저 bundle의 값은 바뀌지 않을까요?

## 실습에서 무엇을 확인하나

이 실습은 세 값을 분리해서 봅니다.

- `NEXT_PUBLIC_BUILD_ENV_NAME`: Docker image build 시점에 browser bundle로 들어가는 public env입니다.
- `RUNTIME_CONFIG_NAME`: Kubernetes ConfigMap에서 Pod 시작 시점에 주입되는 non-secret runtime env입니다.
- `RUNTIME_SECRET_TOKEN`: Kubernetes Secret에서 Pod 시작 시점에 주입되는 secret runtime env입니다.

**핵심은 public env는 image build 결과에 가깝고, runtime env는 Pod가 시작될 때의 환경에 가깝다는 점입니다.**

## 왜 local kind부터 확인할까

EKS에서 바로 확인하면 ECR, IAM, External Secrets Operator, AWS Secrets Manager까지 한꺼번에 봐야 합니다. local kind는 같은 애플리케이션을 작은 Kubernetes cluster에 올려서 Next.js와 Kubernetes env 경계만 먼저 확인합니다.

장점은 빠르고 비용이 없다는 점입니다. 단점은 AWS Secrets Manager와 External Secrets Operator의 실제 IAM 동작은 검증하지 못한다는 점입니다. 그래서 local kind는 경계 학습용이고, AWS 연동은 다음 문서에서 따로 봅니다.

## 준비

아래 도구가 필요합니다.

- Docker
- kind
- kubectl
- jq

이미지를 빌드합니다. `BUILD_ENV` 값은 build-time public env로 고정됩니다.

```bash
cd aws/eks-nextjs-env-secret
make build-image BUILD_ENV=local-build-v1
```

kind cluster를 만들고 이미지를 로드합니다.

```bash
make create_kind
make load-image
```

## 처음 배포하면 어떤 값이 보일까

local manifest를 배포합니다.

```bash
make deploy-local
```

다른 터미널에서 port-forward를 실행합니다.

```bash
cd aws/eks-nextjs-env-secret
make port-forward
```

API 응답을 확인합니다. Secret 원문은 반환하지 않고 fingerprint만 반환합니다.

```bash
make curl-local
```

응답 예시는 아래 형태입니다.

```json
{
  "nextPublicBuildEnvName": "local-build-v1",
  "runtimeConfigName": "local-runtime-v1",
  "runtimeSecretFingerprint": "..."
}
```

## Secret을 바꾸면 기존 Pod는 왜 바로 바뀌지 않을까

Kubernetes가 Secret을 env로 주입하면 컨테이너 프로세스의 환경변수로 들어갑니다. Secret object가 바뀌어도 이미 실행 중인 프로세스의 환경변수는 자동으로 다시 쓰이지 않습니다.

Secret object만 v2 값으로 바꿉니다.

```bash
kubectl apply -f manifests/local-updates/secret-v2.yaml
make curl-local
```

이 시점에는 기존 Pod가 계속 떠 있으므로 fingerprint가 그대로일 수 있습니다. 새 Secret 값을 보려면 Pod를 다시 시작해야 합니다.

```bash
kubectl rollout restart deployment/nextjs-env-secret-demo -n nextjs-env-secret
kubectl rollout status deployment/nextjs-env-secret-demo -n nextjs-env-secret
make curl-local
```

## build-time env를 바꾸려면 왜 이미지를 다시 빌드해야 할까

`NEXT_PUBLIC_*` 값은 browser bundle에서 쓰이면 `next build` 시점의 값으로 들어갑니다. Kubernetes Deployment env만 바꿔서는 이미 만들어진 JavaScript bundle이 다시 만들어지지 않습니다.

build-time 값을 바꾸려면 이미지를 다시 빌드하고 cluster에 다시 로드합니다.

```bash
make build-image BUILD_ENV=local-build-v2
make load-image
kubectl rollout restart deployment/nextjs-env-secret-demo -n nextjs-env-secret
kubectl rollout status deployment/nextjs-env-secret-demo -n nextjs-env-secret
make curl-local
```

같은 tag를 다시 쓰면 운영에서는 추적이 어려워집니다. 실무에서는 immutable image tag를 쓰는 편이 좋습니다. 장점은 어떤 build-time 값이 들어간 이미지인지 추적하기 쉽다는 점입니다. 단점은 image tag와 배포 manifest를 매번 갱신해야 한다는 점입니다.

## 정리

정리하면, 브라우저 bundle의 public env가 Kubernetes env 변경에 반응하지 않는 이유는 값이 `next build` 시점에 고정되기 때문입니다. 반대로 ConfigMap과 Secret을 env로 주입한 값은 Pod 시작 시점에 결정되므로, 값을 바꾼 뒤에는 rollout으로 새 Pod를 만들어야 합니다.

## 참고자료

- [Next.js Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
