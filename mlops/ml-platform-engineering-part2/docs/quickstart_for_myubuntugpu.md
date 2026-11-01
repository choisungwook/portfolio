# Ubuntu GPU 호스트 재부팅 후 실습 환경 복구 가이드

## 문서의 목적 및 복구 범위

[setup.md](./setup.md) 및 Lab 0을 통해 이미 플랫폼이 배포된 상태에서, 단일 서버(Ubuntu GPU 인스턴스)를 재부팅했을 때 실습 환경을 신속하게 정상 상태로 복구하기 위한 단계별 점검 체크리스트입니다.

### 재부팅 시 데이터 보존 및 초기화 현황

| 구성요소 | 재부팅 후 상태 | 상세 원인 및 동작 메커니즘 |
|---|---|---|
| **k3s 쿠버네티스** | 자동 정상 기동 | systemd 데몬(`k3s.service`)이 활성화되어 자동 시작 |
| **MLflow 기록 (PostgreSQL)** | 완벽 보존 | 호스트 디스크의 영구 볼륨(PVC local-path)에 저장 |
| **KFP 메타데이터 (MySQL)** | 완벽 보존 | 호스트 디스크의 영구 볼륨(PVC local-path)에 저장 |
| **오브젝트 스토리지 (SeaweedFS)** | 완벽 보존 | 호스트 디스크의 영구 볼륨(PVC local-path)에 저장 |
| **노트북 홈 디렉터리 (`/home/jovyan`)** | 완벽 보존 | 사용자 전용 PVC(`income-notebook-workspace`)에 마운트 |
| **Feast 독립 커널 (`~/.venvs/feast`)** | 완벽 보존 | 사용자 홈 디렉터리 내부 가상환경에 설치되어 보존 |
| **Redis (Feast 실시간 온라인 스토어)** | **데이터 초기화 (비어 있음)** | 인메모리 캐시 용도로 PVC 없이 배포됨 (노트북에서 `materialize` 재실행 필요) |
| **Feast UI (`feast` 네임스페이스)** | 자동 정상 기동 | 무상태 서비스이며 S3 중앙 레지스트리 파일을 다시 읽어옴 |
| **KServe `income-classifier` 서빙 파드** | 기동 시 약 2분 소요 | 파드 생성 시 init 컨테이너가 모델 의존성(`requirements.txt`)을 자동 재설치 |
| **로컬 PC의 포트 포워딩** | 모두 연결 해제 | 터미널에서 `kubectl port-forward` 명령 재실행 필요 |

---

## 호스트 재부팅 후 단계별 복구 절차

### 1. k3s 서비스 및 GPU 드라이버 상태 확인

로컬 PC에서 SSH를 통해 Ubuntu 서버의 k3s 데몬과 GPU 인식 상태를 확인합니다.

```bash
ssh <Ubuntu 사용자>@<Ubuntu IP> 'systemctl is-active k3s; nvidia-smi --query-gpu=name --format=csv,noheader'
```

`active`와 GPU 장치명(예: `NVIDIA GeForce RTX 5060 Ti`)이 출력되면 정상입니다.

### 2. 쿠버네티스 노드 Ready 상태 확인

```bash
kubectl get nodes
```

노드가 `Ready` 상태인지 확인합니다.

### 3. Argo CD 전체 애플리케이션 Healthy 상태 확인

클러스터 재부팅 후 수많은 파드가 동시에 기동되므로 약 3~5분이 소요될 수 있습니다. 21개 애플리케이션이 모두 `Synced` 및 `Healthy`가 될 때까지 확인합니다.

```bash
kubectl -n argocd get applications.argoproj.io
```

### 4. Kubeflow 파드의 Istio 사이드카 주입 상태 점검

호스트가 재기동될 때 `istiod`보다 먼저 실행된 파드는 간혹 Istio 사이드카가 주입되지 않고 기동될 수 있습니다. (`1/1 Ready` 상태)
원래 사이드카를 쓰지 않는 4개 파드(`kubeflow-pipelines-profile-controller`, `metacontroller`, `metadata-envoy-deployment`, `poddefaults-webhook-deployment`)를 제외하고 다른 파드가 `1/1`로 떠 있거나 Kubeflow 웹 대시보드가 열리지 않으면 파드를 안전하게 재기동합니다.

```bash
# istiod 정상 확인 후 kubeflow 네임스페이스 파드 일괄 재기동
kubectl -n kubeflow delete pod --all

# 노트북 파드 재기동 (홈 디렉터리는 PVC에 영구 보존되므로 안전함)
kubectl -n kubeflow-user-example-com delete pod income-notebook-0
```

### 5. GPU 타임슬라이싱 할당량 확인

노드가 논리적 GPU 슬롯 4개를 정상 인식하고 있는지 확인합니다.

```bash
kubectl get node -o jsonpath='{.items[0].status.allocatable.nvidia\.com/gpu}'; echo
```

`4`가 출력되면 정상입니다.

### 6. 주요 웹 대시보드 포트 포워딩 재연결

로컬 터미널을 열고 필요한 웹 서비스들의 포트 포워딩을 다시 연결합니다.

```bash
# Kubeflow 중앙 대시보드 (http://localhost:8080)
kubectl -n istio-system port-forward svc/istio-ingressgateway 8080:80

# MLflow 실험 및 모델 레지스트리 UI (http://localhost:5000)
kubectl -n mlflow port-forward svc/mlflow-service 5000:5000

# Feast 피처 스토어 UI (http://localhost:8889)
kubectl -n feast port-forward svc/feast-ui 8889:80
```

브라우저에서 각 URL에 접속하여 이전의 실험 기록과 피처들이 안전하게 보존되어 있는지 확인합니다.

### 7. 진행 중이던 시나리오별 후속 조치

| 진행 중이던 시나리오 | 수행할 조치 |
|---|---|
| **시나리오 7 (모델 서빙)** | `kubectl -n kubeflow-user-example-com wait isvc/income-classifier --for=condition=Ready --timeout=15m` 완료를 확인한 후, predictor 포트 포워딩(`8085:80`) 재실행 |
| **시나리오 8 (피처 스토어)** | Redis 캐시가 초기화되었으므로, `feast/01-feature-store.ipynb`를 **Python (feast)** 커널로 열어 전체 셀 재실행 (`materialize` 재동기화) |
| **기타 시나리오 (1~6)** | 별도 조치 불필요 (작업 파일, MLflow 실험 기록, KFP 파이프라인 이력이 영구 보존됨) |
