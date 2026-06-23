# EKS Next.js env Secret 문서

| 순서 | 문서 | 설명 |
|---|---|---|
| 1 | [local kind에서 env 경계 확인](./1-local-kind-env.md) | build-time env와 runtime env/Secret 차이를 로컬에서 확인 |
| 2 | [EKS에서 AWS Secrets Manager와 External Secrets 연결](./2-eks-secrets-manager.md) | External Secrets Operator로 AWS Secrets Manager 값을 Kubernetes Secret으로 동기화 |
| 3 | [GitHub Actions build/deploy 분리](./3-github-actions.md) | image build와 EKS deploy job을 분리하고 Secret value를 Actions에 두지 않는 흐름 |
