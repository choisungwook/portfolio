# Pull Request Generator manifests

| 디렉터리/파일 | 설명 |
|---|---|
| `argocd/` | kind cluster에 Argo CD를 설치하고 `argocd-server` NodePort를 여는 kustomization |
| `applicationset/` | GitHub App 인증을 사용하는 Pull Request Generator `.example.yaml` 설정 |
| `gateway/` | Istio Ambient shared waypoint `Gateway` |
| `app/` | 기준 Service와 PR Service를 같은 템플릿으로 배포하는 Helm chart. `httpRoute.enabled` 기본값은 `false` |
