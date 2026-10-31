# 트러블슈팅

Lab 0과 Lab 1을 k3s v1.36.5에서 진행하며 만난 문제와 해결 방법입니다. 1~10번은 처음 구성(KFP standalone, 일반 JupyterLab)에서, 11번부터는 Kubeflow 배포판으로 다시 설치하며 만났습니다. 지금 구성에 맞지 않는 내용은 고쳐 두었습니다.

## 1 MLflow 파드가 OOMKilled로 계속 재시작됨

- 증상
  - `mlflow` Application이 `Degraded`이고 MLflow 파드가 `OOMKilled`로 재시작을 반복함
  - 메모리 limit은 1Gi였음
- 해결방법
  - `mlflow server`는 기본으로 uvicorn worker 4개와 server job 실행용 Huey consumer 프로세스를 띄우고, `-full` 이미지에서는 프로세스마다 MLflow 전체를 import함
  - `--workers=1`만으로는 OOM이 계속돼서, `MLFLOW_SERVER_ENABLE_JOB_EXECUTION=false`로 server job 실행도 끔(책 4~6장은 이 기능을 쓰지 않음)
  - 두 설정 뒤 메모리 사용량은 약 370Mi

## 2 Application이 Healthy인데 계속 OutOfSync

- 증상
  - sync가 성공해도 `kf-roles`, `kf-istio`, `kf-pipelines` 같은 Application이 `OutOfSync`로 남음
  - 차이가 나는 곳은 aggregated ClusterRole의 `rules`, Istio ValidatingWebhookConfiguration, CRD의 `preserveUnknownFields`
- 해결방법
  - 세 곳 모두 Git이 아니라 다른 controller나 API 서버가 값을 정함. ClusterRole의 `rules`는 clusterrole-aggregation-controller가 채우고, webhook은 istiod가 고치고, `preserveUnknownFields: false`는 API 서버가 저장하지 않음
  - ApplicationSet 템플릿의 `ignoreDifferences`에 세 곳을 넣음. ClusterRole과 webhook은 `managedFieldsManagers`로, CRD는 `jqPathExpressions`로 지정
  - `RespectIgnoreDifferences=true`를 같이 줘야 sync할 때도 그 필드를 덮어쓰지 않음. 빼면 Argo CD와 controller가 번갈아 값을 바꿈

## 3 kubectl get app으로 Argo CD Application이 안 보임

- 증상
  - KFP 설치 뒤 `kubectl -n argocd get app`이나 `kubectl annotate app mlflow ...`가 `applications.app.k8s.io "mlflow" not found`로 실패함
- 해결방법
  - KFP가 `applications.app.k8s.io` CRD를 설치해서 짧은 이름 `app`이 Argo CD의 `applications.argoproj.io`와 겹침
  - 전체 리소스 이름을 씀

전체 리소스 이름으로 Application 목록을 조회합니다.

```bash
kubectl -n argocd get applications.argoproj.io
```

## 4 MLflow 로그에 PostgreSQL Connection refused가 반복됨

- 증상
  - MLflow 로그에 `connection to server at "<ClusterIP>", port 5432 failed: Connection refused`와 `Operation will be retried`가 여러 번 찍힘
- 해결방법
  - MLflow와 PostgreSQL이 동시에 시작해서, PostgreSQL이 준비되기 전에 MLflow가 접속을 시도하며 생기는 로그
  - MLflow가 backoff로 재시도하고 PostgreSQL이 뜨면 접속하므로 조치는 필요 없음
  - 새로 만든 PR 미리보기 namespace에서 주로 보이고, 파드가 Running이 된 뒤에도 같은 로그가 계속 늘면 PostgreSQL 파드와 `mlflow-postgres` Service를 확인함

## 5 MLflow가 object storage에 연결하지 못함

- 증상
  - MLflow가 아티팩트를 쓸 때 `seaweedfs.kubeflow:8333`에서 `Connection refused`나 503이 남
- 해결방법
  - Kubeflow 배포판은 `kubeflow` namespace에 같은 namespace 안의 통신만 허용하는 `default-allow-same-namespace` NetworkPolicy를 걸고, 서비스마다 허용 정책을 따로 둠. k3s는 NetworkPolicy를 기본 집행함
  - 배포판의 `seaweedfs` 정책은 8333 포트를 profile namespace(`app.kubernetes.io/part-of: kubeflow-profile`)와 `istio-system` 등에만 엶. 노트북은 profile namespace라 통과하지만 `mlflow` namespace는 막힘
  - 처음 구성에서는 `seaweedfs` 정책을 지웠지만, 배포판에서는 정책 하나를 지워도 `default-allow-same-namespace`가 막아서 해결되지 않음
  - 배포판 정책은 그대로 두고, `mlops-part2/s3-access: "true"` label이 붙은 namespace를 허용하는 `seaweedfs-allow-s3-clients` 정책을 더함. `mlflow` namespace(와 PR 미리보기 namespace)에 그 label을 붙임

## 6 맥북으로 kubeconfig 복사가 비밀번호 요구로 실패함

- 증상
  - `ssh <Ubuntu> sudo cat /etc/rancher/k3s/k3s.yaml`이 tty가 없어 sudo 비밀번호를 받지 못하고 실패해 `~/.kube/config-k3s`가 빈 파일이 됨
- 해결방법
  - k3s 설치 옵션에 `--write-kubeconfig-mode=644`를 주고 sudo 없이 `cat`으로 복사함

## 7 sklearn 모델 기록이 UntrustedTypesFoundException으로 실패함

- 증상
  - `mlflow.sklearn.log_model(DecisionTreeClassifier...)`가 `Untrusted types found in the file: ['sklearn.tree._tree.Tree']`로 실패함
- 해결방법
  - MLflow 3.17은 sklearn 모델을 기본으로 skops 형식으로 저장하고, 저장 직후 다시 읽어 보면서 신뢰 목록에 없는 타입을 거절함
  - pickle로 되돌리지 않고 `skops_trusted_types=["sklearn.tree._tree.Tree"]`로 트리 타입만 신뢰 목록에 넣음

## 8 runs:/ URI로 모델을 등록하면 MLmodel 파일을 못 찾음

- 증상
  - `mlflow.register_model("runs:/<run_id>/income-classifier", ...)`가 `Could not find an "MLmodel" configuration file`로 실패함
- 해결방법
  - MLflow 3부터 `log_model`은 모델을 run 아티팩트가 아니라 별도 LoggedModel(`models:/m-...`)로 저장함
  - 학습 노트북이 `log_model`의 반환값 `model_info.model_uri`를 run tag `model_uri`로 남기고, 등록 노트북은 그 URI로 등록함

## 9 모델의 데이터셋 경로가 다른 run의 경로를 가리킴

- 증상
  - 레지스트리 모델의 run을 따라가면 `log_input`의 데이터셋 source가 그 run이 아니라 먼저 실행한 다른 run의 경로(`income-classifier/<다른 run ID>/train.csv`)로 나옴
- 해결방법
  - MLflow는 이름과 내용 해시(digest)가 같은 데이터셋을 experiment 안에 한 번만 저장하고, 처음 기록한 source를 계속 씀. 세 모델이 같은 분할을 쓰므로 데이터셋 레코드가 하나로 합쳐짐
  - 업로드 경로를 run ID가 아니라 digest로 정함(`income-classifier/datasets/train-<digest>.csv`). 같은 데이터는 run이 달라도 같은 경로를 가리킴
  - run을 지워도 데이터셋 레코드는 experiment에 남음. 처음부터 다시 하려면 experiment를 지우고 MLflow 파드에서 `mlflow gc`로 영구 삭제함

## 10 등록 노트북이 데이터셋 source에서 KeyError: 'uri'로 실패함

- 증상
  - champion이 XGBoost run일 때 `json.loads(dataset.source)["uri"]`가 `KeyError`로 실패함
- 해결방법
  - `mlflow.xgboost.autolog()`가 학습 DMatrix를 자체 데이터셋으로 기록하고, 그 source에는 S3 `uri`가 없음
  - 데이터셋은 직접 S3에 올려 기록하므로 `autolog(log_datasets=False)`로 autolog의 데이터셋 기록을 끔

## 11 Istio보다 먼저 뜬 Kubeflow 파드가 동작하지 않음

- 증상
  - 처음 설치한 뒤 Kubeflow 파드 일부가 `1/1`(sidecar 없음)이거나, Dashboard와 Notebook 화면이 열리지 않음
  - `kubectl rollout restart`를 해도 바뀌지 않음
- 해결방법
  - ApplicationSet은 Application 순서를 보장하지 않아서, istiod와 istio-cni가 뜨기 전에 만든 파드에는 sidecar 주입과 트래픽 리다이렉션이 빠짐
  - `rollout restart`가 남기는 annotation을 Argo CD selfHeal이 Git 값으로 되돌려 재시작이 일어나지 않음
  - Istio가 Healthy가 된 뒤 파드를 지워 다시 만들게 함

Istio가 뜬 뒤 kubeflow namespace의 파드를 다시 만듭니다.

```bash
kubectl -n kubeflow delete pod --all
```

## 12 istio-cni-node가 CNI 설정을 찾지 못함

- 증상
  - `istio-cni-node` 파드가 준비되지 않거나, Istio를 쓰는 파드가 `istio-validation` 단계에서 실패함
- 해결방법
  - Istio CNI는 `/opt/cni/bin`과 `/etc/cni/net.d`를 가정하지만, k3s는 `/var/lib/rancher/k3s/data/cni`와 `/var/lib/rancher/k3s/agent/etc/cni/net.d`를 씀
  - `manifests/kubeflow/istio-install` wrapper에서 DaemonSet `istio-cni-node`의 hostPath 두 개를 k3s 경로로 patch함

## 13 버킷 생성 Job이 Pod Security에 막힘

- 증상
  - `create-buckets` Job이 파드를 만들지 못하고 `violates PodSecurity "restricted:latest"` 이벤트가 남음
- 해결방법
  - 배포판은 `kubeflow` namespace에 Pod Security `restricted`를 집행함
  - Job에 `runAsNonRoot: true`, `runAsUser: 65534`, `seccompProfile: RuntimeDefault`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`을 넣고, aws CLI가 쓸 `HOME=/tmp`를 줌

## 14 PostSync hook이 끝나지 않아 sync가 멈춤

- 증상
  - `kf-pipelines`가 계속 `Syncing`이고 PostSync hook `create-buckets`가 끝나지 않음
- 해결방법
  - object storage에 연결하지 못한 Job이 재시도를 계속해서 sync 작업이 끝나지 않음(원인은 5번)
  - 원인을 고친 뒤 진행 중인 sync를 끊고, Job을 지우고, 다시 sync함

진행 중인 sync 작업을 끊습니다.

```bash
argocd app terminate-op argocd/kf-pipelines --core
```

## 15 Helm chart 리소스에 namespace가 없어 sync가 거절됨

- 증상
  - `mlflow`, `nvidia-device-plugin` Application이 `InvalidSpecError`로 sync되지 않음
- 해결방법
  - kustomize `helmCharts`로 렌더링한 chart 리소스 일부에 namespace가 비어 있고, Application에도 `destination.namespace`가 없었음
  - `mlops-part2-platform` ApplicationSet 템플릿에 `destination.namespace: '{{ .namespace }}'`를 넣음

## 16 NVIDIA device plugin 파드가 뜨지 않음

- 증상
  - `nvidia-device-plugin` DaemonSet의 파드 수가 0이고 노드가 `nvidia.com/gpu`를 알리지 않음
- 해결방법
  - chart 기본 affinity가 Node Feature Discovery(NFD)가 붙이는 label이 있는 노드만 고름. NFD를 설치하지 않아 맞는 노드가 없음
  - values에 `affinity: null`을 넣어 affinity를 지움

## 17 MLflow DB migration이 다른 버전으로 실행됨

- 증상
  - MLflow chart의 migration initContainer가 서버 이미지(3.17.2)와 다른 3.16 이미지를 씀
- 해결방법
  - chart 1.11.7의 `initImages.mlflowDbMigration` 기본값이 서버 이미지와 따로 정해져 있음
  - values에서 migration 이미지를 서버와 같은 `ghcr.io/mlflow/mlflow:v3.17.2-full`로 지정함

## 18 Kubeflow 주소를 curl로 열면 403이 나옴

- 증상
  - `curl http://localhost:8080`이 403을 돌려줌
- 해결방법
  - oauth2-proxy가 로그인하지 않은 요청에 Sign In 화면과 함께 403을 돌려주는 정상 동작
  - 브라우저로 열고 **Sign In**을 누르면 Dex 로그인 화면으로 넘어감

## 19 KFP 파이프라인이 다음 단계에서 아티팩트를 내려받지 못함

- 증상
  - 첫 컴포넌트는 성공하고, 다음 컴포넌트가 `failed to download input artifact ... ListObjectsV2 ... 403 AccessDenied`로 실패함
  - `mlpipeline` 버킷에 bucket policy가 없음
- 해결방법
  - KFP profile controller는 namespace의 S3 access key를 처음 만들 때 한 번만 `mlpipeline` 버킷에 ListBucket 정책을 넣음
  - access key가 `create-buckets` Job이 버킷을 만들기 전에 만들어져 정책 설정이 실패했고, controller는 다시 시도하지 않음
  - 사용자 namespace의 Secret을 지우면 controller가 새 key를 만들면서 정책도 다시 넣음

namespace의 KFP용 S3 Secret을 지워 다시 만들게 하는 명령입니다.

```bash
kubectl -n kubeflow-user-example-com delete secret mlpipeline-minio-artifact
```

## 20 Notebook에 label을 더했는데 PodDefault가 적용되지 않음

- 증상
  - Notebook 리소스에 `access-ml-pipeline: "true"`를 더하고 파드를 지웠는데 `/var/run/secrets/kubeflow/pipelines/token`이 없음
- 해결방법
  - notebook-controller는 StatefulSet을 만들 때만 Notebook의 label을 파드 템플릿에 복사함
  - StatefulSet을 지우면 controller가 새 label로 다시 만듦. PVC는 그대로 남음

notebook-controller가 StatefulSet을 새 label로 다시 만들게 하는 명령입니다.

```bash
kubectl -n kubeflow-user-example-com delete sts income-notebook
```
