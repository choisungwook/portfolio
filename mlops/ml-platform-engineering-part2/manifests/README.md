# manifests

Argo CD가 읽는 매니페스트입니다. 사람이 직접 적용하는 파일은 `argocd/`의 ApplicationSet 3개(`scripts/up.sh`)와 `kubeflow-notebook/`입니다.

| 디렉터리/파일 | 설명 |
|---|---|
| `argocd/kubeflow-applicationset.yaml` | list generator. Kubeflow 배포판 26.03.1 구성요소 16개마다 Application |
| `argocd/platform-applicationset.yaml` | list generator. `nvidia-device-plugin/`, `mlflow/`, `redis/`, `kubeflow/user-resources/`마다 Application |
| `argocd/mlflow-preview-applicationset.yaml` | pullRequest generator. `preview` label PR마다 `mlflow/`를 `preview-<번호>` namespace에 배포 |
| `kubeflow/istio-install/` | 배포판 Istio. istio-cni-node의 CNI 경로를 k3s 경로로 patch |
| `kubeflow/pipelines/` | 배포판 KFP와 object storage(SeaweedFS). 버킷 생성 Job, MLflow 접근 허용 NetworkPolicy |
| `kubeflow/kserve/` | 배포판 KServe v0.19.0. Standard 모드, Ingress 생성 끔 |
| `kubeflow/user-resources/` | 사용자 namespace의 PodDefault `mlflow-access`, `access-ml-pipeline`과 Secret |
| `kubeflow-notebook/` | Argo CD 밖. kubectl로 만드는 Kubeflow Notebook과 PVC(Lab 1) |
| `mlflow/` | MLflow 3.17.2 Helm chart(community-charts 1.11.7)와 PostgreSQL |
| `nvidia-device-plugin/` | NVIDIA device plugin Helm chart 0.20.1. time-slicing으로 GPU 1장을 4개로 |
| `redis/` | Feast 온라인 스토어 |
