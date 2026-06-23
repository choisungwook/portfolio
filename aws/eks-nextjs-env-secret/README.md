# EKS Next.js env Secret hands-on

Next.js를 EKS에 배포할 때 build-time env, runtime env, Secret이 어디에서 고정되고 어디에서 바뀌는지 직접 확인합니다.

## 문서

- [문서 인덱스](./docs/README.md)
- [1. local kind에서 env 경계 확인](./docs/1-local-kind-env.md)
- [2. EKS에서 AWS Secrets Manager와 External Secrets 연결](./docs/2-eks-secrets-manager.md)
- [3. GitHub Actions build/deploy 분리](./docs/3-github-actions.md)

## 파일

- [app](./app/)
- [kind](./kind/)
- [manifests](./manifests/)
- [terraform](./terraform/)
- [github-actions](./github-actions/)
