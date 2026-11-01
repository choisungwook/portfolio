# Lab 0. 책의 플랫폼 설치 경로는 2026년에 그대로 동작하지 않습니다

> k3s v1.36.5 단일 노드(GPU 1장)에서 Argo CD Application 20개가 Synced, Healthy인 것까지 확인했습니다. 진행 중 만난 문제는 [troubleshooting.md](./troubleshooting.md)에 있습니다.

## 책이 전제하는 플랫폼

책 "Machine Learning Platform Engineering" 4~6장은 MLflow, Feast, Kubeflow Pipelines(KFP), 서빙, 드리프트 감시를 차례로 다룹니다. 모든 장이 부록 A가 설치한 플랫폼이 이미 떠 있다는 전제로 시작합니다.

부록 A의 경로는 2026년 10월 기준으로 그대로 따라 할 수 없습니다.

- Kubeflow 1.7 매니페스트는 지금의 Kubernetes 1.36과 맞지 않습니다.
- MinIO와 BentoML Yatai 저장소는 archive됐습니다.
- KFP는 기본 object storage를 MinIO에서 SeaweedFS로 바꿨습니다.

## 이 Lab이 바꾼 것

책의 목표는 MLflow와 Kubeflow로 MLOps 이론을 실습하는 것입니다. 그래서 Kubeflow가 제공하는 구성요소는 Kubeflow 배포판(Community Distribution 26.03.1)에서 가져오고, 나머지만 Helm chart로 설치합니다.

| 책(부록 A) | 이 Lab | 설치 방법 |
|---|---|---|
| Kubeflow 1.7 전체 | Kubeflow 배포판 중 4~6장이 쓰는 구성요소 16개 | kustomize |
| MinIO | object storage(SeaweedFS). KFP가 함께 설치 | kustomize(Kubeflow) |
| MLflow | MLflow 3.17.2, PostgreSQL | Helm chart |
| BentoML Yatai | KServe v0.19.0. Kubeflow 배포판에 포함 | kustomize(Kubeflow) |
| 맥북 Jupyter | Kubeflow Notebooks | kustomize(Kubeflow) |
| 없음 | GPU 한 장을 4개로 나누는 time-slicing | Helm chart |

모든 구성요소는 Argo CD ApplicationSet이 Git에서 읽어 설치합니다. 시나리오는 아래 순서로 진행합니다.

1. [플랫폼 설치](./2-lab0-platform-install.md)
2. [GPU를 여러 파드가 나눠 쓰게 만들기](./3-lab0-gpu-time-slicing.md)
3. [PR마다 미리보기 환경 띄우기](./4-lab0-pr-preview.md)
4. [정리](./5-lab0-cleanup.md)

## 책의 MinIO 주소는 object storage(SeaweedFS) 주소로 바뀝니다

책 코드의 MinIO 주소는 호스트 이름과 포트만 바꾸면 됩니다. 계정은 KFP의 기본값이 책과 같습니다.

| 접속 위치 | 책 | 이 Lab |
|---|---|---|
| 클러스터 안 | `http://minio-service.kubeflow.svc.cluster.local:9000` | `http://seaweedfs.kubeflow.svc.cluster.local:8333` |
| 맥북(port-forward) | `http://localhost:9000` | `http://localhost:8333` |
| 계정 | `minio` / `minio123` | 같음. KFP Secret `mlpipeline-minio-artifact`의 기본값 |

버킷은 책 코드가 기대하는 이름 그대로 만듭니다. `feature-data-sets`, `feature-registry`, `mlflow-datasets`, `inference-datasets`에 MLflow 아티팩트용 `mlflow-artifacts`를 더해 5개입니다.

## 부록. 구성요소를 고른 기준

Kubeflow 배포판에는 Katib, Trainer, Spark Operator, Knative, Model Registry도 있습니다. Part 2(4~6장)는 이것들을 쓰지 않아서 뺐습니다. 단일 노드의 메모리를 아끼는 효과도 있습니다.

| 뺀 구성요소 | 빼도 되는 이유 |
|---|---|
| Katib | 하이퍼파라미터 튜닝. Part 2 범위 밖 |
| Trainer, Spark Operator | 분산 학습과 Spark. 4장 학습은 노트북 하나로 끝남 |
| Knative | KServe를 Standard 모드로 쓰므로 필요 없음 |
| Model Registry | MLflow model registry를 씀 |

MLflow는 Kubeflow 구성요소가 아니고 공식 Helm chart도 없습니다. community-charts의 `mlflow` chart 1.11.7을 kustomize의 `helmCharts`로 불러 씁니다. 결정 과정은 [knowledge/decisions](../knowledge/decisions/index.md)에 있습니다.
