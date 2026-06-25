# setup

## kind cluster 설치

```bash
cd kubernetes/argocd/pull_request_generator
make up
kubectl get node
```

## Argo CD 설치

```bash
kubectl apply -k manifests/argocd
kubectl wait -n argocd --for=condition=Available deployment/argocd-server --timeout=300s
kubectl wait -n argocd --for=condition=Available deployment/argocd-applicationset-controller --timeout=300s
```

Argo CD UI 확인 주소입니다.

```text
https://localhost:30443
```

초기 비밀번호를 확인합니다.

```bash
kubectl get secret argocd-initial-admin-secret \
  -n argocd \
  -o jsonpath='{.data.password}' | base64 -d
```

## GitHub App 생성

GitHub에서 다음 화면으로 이동합니다.

```text
GitHub > Settings > Developer settings > GitHub Apps > New GitHub App
```

생성값입니다.

| 항목 | 값 |
|---|---|
| GitHub App name | `<GITHUB_OWNER>-argocd-pr-workload` |
| Homepage URL | `https://localhost:30443` |
| Callback URL | `https://localhost:30443` |
| Webhook | 비활성화 |
| Repository access | 대상 repository만 선택 |
| Metadata | Read-only |
| Contents | Read-only |
| Pull requests | Read-only |
| Issues | Read-only, label filter 문제 시 필요 여부 확인 필요 |

permission은 permissions&events 메뉴에서 확인할 수 있습니다.

![github_app_permission1](../imgs/github_app_permission1.png)

## Github App을 github repo에 설치

생성한 Github App을 github repo에 설치합니다. https://github.com/settings/installations 접속 후 설치할 reo를 선택합니다.

![install_githubapp_1](../imgs/install_githubapp_1.png)

![install_githubapp_2](../imgs/install_githubapp_2.png)

![install_githubapp_3](../imgs/install_githubapp_3.png)

## Argo CD GitHub App 연동

Secret 예제를 복사합니다.

```bash
cp manifests/applicationset/github-app-repo-creds.example.yaml \
  manifests/applicationset/github-app-repo-creds.yaml
```

`github-app-repo-creds.yaml`에 값을 채웁니다.

```yaml
url: https://github.com/<MANIFEST_OWNER>/<MANIFEST_REPO>.git
githubAppID: "<GITHUB_APP_ID>"
githubAppInstallationID: "<GITHUB_APP_INSTALLATION_ID>"
githubAppPrivateKey: |
  -----BEGIN PRIVATE KEY-----
  <GITHUB_APP_PRIVATE_KEY>
  -----END PRIVATE KEY-----
```

github id: Developer settings → GitHub Apps → ArgoCDPullRequestGenerator

![github_appid](../imgs/github_appid.png)

githubAppInstallationID:

1. https://github.com/settings/installations 접속
2. 해당 App의 Configure 버튼 클릭
3. 주소창 URL 끝의 숫자가 installation ID

private key는 github app에서 생성할 수 있습니다.

![github_app_privatekey](../imgs/github_app_privatekey.png)

Secret을 생성하고 확인합니다.

```bash
kubectl apply -f manifests/applicationset/github-app-repo-creds.yaml
kubectl get secret github-app-repo-creds -n argocd --show-labels
```

## Istio 설치

Gateway API CRD를 먼저 설치합니다.

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.0/standard-install.yaml
kubectl get crd \
  gatewayclasses.gateway.networking.k8s.io \
  gateways.gateway.networking.k8s.io \
  httproutes.gateway.networking.k8s.io
```

Istio Ambient profile을 설치합니다.

```bash
istioctl install --set profile=ambient --skip-confirmation
kubectl get pod -n istio-system
kubectl get gatewayclass
```

`GatewayClass` 목록에 `istio`와 `istio-waypoint`가 보여야 합니다. 보이지 않으면 Gateway API CRD 설치 후 Istio 설치를 다시 실행합니다.

## Gateway 설치

Istio Gateway API가 사용할 ingress Gateway를 적용합니다. kind cluster에서는 기본 설정으로 LoadBalancer를 없으므로, gateway service는 ClusterIP를 사용합니다.

```bash
kubectl apply -k manifests/gateway
kubectl wait -n istio-ingress --for=condition=Programmed gateway/ingress-gateway --timeout=300s
kubectl get gateway -n istio-ingress
kubectl get deployment -n istio-ingress
kubectl get service -n istio-ingress
```

![get_gateway](../imgs/get_gateway.png)

로컬 호출을 위해 Gateway Service를 port-forward합니다.

```bash
GATEWAY_SERVICE=$(kubectl get service -n istio-ingress -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n istio-ingress service/${GATEWAY_SERVICE} 8080:80
```

다른 터미널에서 hosts를 설정합니다.

```bash
sudo sh -c 'cat >> /etc/hosts <<EOF
127.0.0.1 app.local.test pr-123.local.test
EOF'
```

## 다음 실습

| 문서 | 내용 |
|---|---|
| [helm-chart-gateway-test.md](./helm-chart-gateway-test.md) | Helm chart로 리소스를 배포하고 Gateway로 호출 |
| [pull-request-generator-header-routing.md](./pull-request-generator-header-routing.md) | Pull Request Generator로 배포하고 헤더 기반 라우팅 확인 |
