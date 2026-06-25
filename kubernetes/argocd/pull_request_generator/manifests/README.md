# Pull Request Generator manifests

| 디렉터리/파일 | 설명 |
|---|---|
| `argocd/` | kind cluster에 Argo CD를 설치하고 `argocd-server` NodePort를 여는 kustomization |
| `applicationset/` | GitHub App 인증을 사용하는 Pull Request Generator `.example.yaml` 설정 |
| `gateway/` | Istio `GatewayClass istio`에 붙는 ingress Gateway |
| `baseline/` | Istio Ambient service-to-service route가 붙을 원본 Service Helm chart |
| `app/` | Pull Request Generator가 release namespace에 sync할 Deployment, Service, optional Gateway API route Helm chart |
