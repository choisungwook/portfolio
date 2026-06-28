# setup

## TL;DR

이 실습은 kind cluster에서 Argo CD, Gateway API CRD, Istio Ambient, shared waypoint를 준비합니다.

## kind cluster 설치

kind cluster를 만듭니다.

```bash
cd kubernetes/argocd/pull_request_generator
make up
kubectl get node
```

## Argo CD 설치

Argo CD와 ApplicationSet controller를 설치합니다.

```bash
kubectl apply --server-side --force-conflicts -k manifests/argocd
kubectl wait --for=condition=Established crd/applicationsets.argoproj.io --timeout=120s
kubectl wait -n argocd --for=condition=Available deployment/argocd-server --timeout=300s
kubectl wait -n argocd --for=condition=Available deployment/argocd-applicationset-controller --timeout=300s
```

Argo CD install manifest에는 큰 CRD가 포함되어 있으므로 server-side apply를 사용합니다. 일반 `kubectl apply -k`로 설치하면 `applicationsets.argoproj.io` CRD가 빠져 ApplicationSet 적용 시 `no matches for kind "ApplicationSet"` 오류가 날 수 있습니다.

ApplicationSet CRD가 설치됐는지 확인합니다.

```bash
kubectl get crd applicationsets.argoproj.io
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

## waypoint 설치

Istio Ambient L7 route가 사용할 shared waypoint를 적용합니다. 이 리소스는 외부 ingress가 아니라 `HBONE` listener를 가진 waypoint입니다.

```bash
kubectl apply -k manifests/gateway
kubectl wait -n istio-waypoint --for=condition=Programmed gateway/waypoint --timeout=300s
kubectl get gateway -n istio-waypoint
kubectl get deployment -n istio-waypoint
kubectl get service -n istio-waypoint
```

waypoint listener가 `HBONE`인지 확인합니다.

```bash
kubectl get gateway waypoint -n istio-waypoint -o yaml
```

## 다음 실습

| 문서 | 내용 |
|---|---|
| [3-helm-chart-gateway-test.md](./3-helm-chart-gateway-test.md) | Helm chart 하나로 prod app과 PR app을 배포하고 test client로 waypoint route 확인 |
| [4-pull-request-generator-header-routing.md](./4-pull-request-generator-header-routing.md) | Pull Request Generator로 PR app을 배포하고 헤더 기반 mesh route 확인 |
