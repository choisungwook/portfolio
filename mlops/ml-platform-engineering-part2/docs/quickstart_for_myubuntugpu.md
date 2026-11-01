# GPU Ubuntu 전원을 다시 켠 뒤 실습 환경을 되살리는 순서

## 이 문서의 범위

[setup.md](./setup.md)와 Lab 0으로 이미 설치한 클러스터를, Ubuntu 호스트를 끄고 다시 켠 뒤 실습할 수 있는 상태로 되돌리는 점검표입니다. 처음 설치는 다루지 않습니다.

재부팅 뒤 무엇이 남고 무엇이 비는지 먼저 정리했습니다.

| 구성요소 | 재부팅 뒤 | 이유 |
|---|---|---|
| k3s | 자동으로 시작 | 설치 스크립트가 systemd 서비스 `k3s`를 enable함 |
| MLflow 기록(PostgreSQL), KFP 기록(MySQL), object storage(SeaweedFS), 노트북 홈 디렉터리 | 그대로 남음 | 모두 PVC(local-path)에 저장 |
| Feast 전용 커널(`~/.venvs/feast`) | 그대로 남음 | 노트북 홈 디렉터리(PVC) 안에 있음 |
| Redis(Feast 온라인 스토어) | 빔 | PVC 없이 띄움. materialize로 다시 채움 |
| KServe `income-classifier` | 다시 뜨는 데 2분쯤 걸림 | 파드가 뜰 때마다 모델의 `requirements.txt`를 설치 |
| 맥북의 port-forward | 끊김 | 다시 띄워야 함 |

재부팅 뒤 동작을 직접 확인한 문서가 아닙니다. 순서는 설치하면서 겪은 문제([troubleshooting.md](./troubleshooting.md))를 바탕으로 정했습니다. 다르게 동작하면 이 문서를 고칩니다.

## 끄기 전에

따로 할 일은 없습니다. JupyterLab에서 저장하지 않은 노트북만 저장하고 Ubuntu를 끕니다.

## 켠 뒤에

### 1. k3s와 GPU 드라이버가 올라왔는지 봅니다

맥북에서 Ubuntu에 접속해 k3s 서비스와 GPU를 확인합니다. `active`와 GPU 이름이 나오면 됩니다.

```bash
ssh <Ubuntu 사용자>@<Ubuntu IP> 'systemctl is-active k3s; nvidia-smi --query-gpu=name --format=csv,noheader'
```

### 2. 맥북에서 노드가 Ready인지 봅니다

`~/.zshrc`에 넣어 둔 `KUBECONFIG`로 k3s 컨텍스트를 씁니다([setup.md](./setup.md)).

```bash
kubectl get nodes
```

### 3. Argo CD Application이 모두 Healthy인지 봅니다

파드가 한꺼번에 다시 뜨므로 몇 분 걸립니다. 20개가 모두 `Synced`, `Healthy`가 될 때까지 기다립니다.

```bash
kubectl -n argocd get applications.argoproj.io
```

### 4. Kubeflow 파드에 Istio sidecar가 붙었는지 봅니다

재부팅하면 모든 파드가 동시에 다시 뜹니다. istiod보다 먼저 뜬 파드에는 sidecar가 빠질 수 있습니다([troubleshooting.md](./troubleshooting.md) 11번). 정상일 때 `READY`가 `1/1`인 파드는 원래 sidecar를 쓰지 않는 4개(`kubeflow-pipelines-profile-controller`, `metacontroller`, `metadata-envoy-deployment`, `poddefaults-webhook-deployment`)뿐입니다. 이 밖에 `1/1`인 파드가 보이거나 Kubeflow 화면이 열리지 않으면 파드를 다시 만듭니다. `Completed`인 `create-buckets` Job 파드는 무시합니다.

```bash
kubectl -n kubeflow get pods
```

Istio가 Healthy인 것을 확인한 뒤 kubeflow namespace의 파드를 지워 다시 만듭니다.

```bash
kubectl -n kubeflow delete pod --all
```

노트북 파드도 같은 이유로 sidecar가 빠질 수 있습니다. `income-notebook-0`이 `2/2`가 아니면 지웁니다. 홈 디렉터리는 PVC라서 그대로 남습니다.

```bash
kubectl -n kubeflow-user-example-com delete pod income-notebook-0
```

### 5. GPU가 4개로 보이는지 봅니다

time-slicing이 다시 적용됐으면 `4`가 나옵니다([3-lab0-gpu-time-slicing.md](./3-lab0-gpu-time-slicing.md)).

```bash
kubectl get node -o jsonpath='{.items[0].status.allocatable.nvidia\.com/gpu}'; echo
```

### 6. 화면을 다시 엽니다

맥북 터미널 두 개에서 Kubeflow 화면과 MLflow 화면을 엽니다.

```bash
kubectl -n istio-system port-forward svc/istio-ingressgateway 8080:80
```

```bash
kubectl -n mlflow port-forward svc/mlflow-service 5000:5000
```

`http://localhost:8080`에서 Notebooks와 Pipelines가, `http://localhost:5000`에서 experiment `income-classifier`의 run이 보이면 기록이 남아 있는 것입니다.

### 7. 하던 시나리오에 따라 추가로 되살립니다

| 하던 시나리오 | 할 일 |
|---|---|
| 7. 모델 서빙 | `kubectl -n kubeflow-user-example-com wait isvc/income-classifier --for=condition=Ready --timeout=15m`으로 기다린 뒤 predictor를 다시 port-forward |
| 8. 피처 스토어 | Redis가 비어 있으므로 `feast/01-feature-store.ipynb`를 **Python (feast)** 커널로 처음부터 다시 실행 |
| 나머지 | 할 일 없음. 노트북 파일과 MLflow, KFP 기록이 남아 있음 |
