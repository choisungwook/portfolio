# Lab 0. 문제 배경: 최신 오픈소스 환경 기반의 ML 플랫폼 재구성

> **검증 환경**: k3s v1.36.5 단일 노드(NVIDIA GPU 1장), Argo CD Application 20개 Synced & Healthy 상태 기준. 진행 중 발생하는 문제는 [troubleshooting.md](./troubleshooting.md)를 참고합니다.

## 도서 원작 플랫폼 구성의 한계

도서 *Machine Learning Platform Engineering* 4~6장은 MLflow, Feast, Kubeflow Pipelines(KFP), 모델 서빙, 드리프트 감지를 순차적으로 다룹니다. 원작의 실습은 부록 A에서 안내하는 플랫폼 구성이 사전에 배포되어 있다는 것을 전제로 합니다.

하지만 부록 A의 안내는 2026년 기준 다음과 같은 호환성 및 아카이브 문제가 발생합니다.

- **쿠버네티스 버전 불일치**: Kubeflow 1.7 매니페스트는 최신 Kubernetes 1.36 환경과 호환되지 않습니다.
- **저장소 아카이브(Deprecated)**: 원작에서 사용한 MinIO 및 BentoML Yatai 관련 저장소가 아카이브되어 정상 설치가 어렵습니다.
- **기본 스토리지 변경**: 최신 Kubeflow Pipelines(KFP)의 기본 오브젝트 스토리지가 MinIO에서 SeaweedFS로 전환되었습니다.

## 본 실습(Lab)의 개선 방향

본 실습의 목적은 MLflow와 Kubeflow를 활용해 실무 수준의 MLOps 이론과 수명주기를 검증하는 데 있습니다. 따라서 검증된 Kubeflow 배포판(Community Distribution 26.03.1)을 기반으로 필요한 컴포넌트만 선별 도입하고, 나머지는 표준 Helm 차트로 구성했습니다.

| 구분 | 도서 원작 (부록 A) | 본 핸즈온 (2026 최신화) | 배포 방식 |
|---|---|---|---|
| **기본 플랫폼** | Kubeflow 1.7 전체 | Kubeflow 배포판 중 4~6장에 필요한 16개 컴포넌트 선별 | Kustomize |
| **오브젝트 스토리지** | MinIO | SeaweedFS (KFP 내장 기본 스토리지) | Kustomize (Kubeflow) |
| **실험 관리 및 레지스트리** | MLflow | MLflow 3.17.2 + PostgreSQL | Helm Chart |
| **모델 서빙** | BentoML Yatai | KServe v0.19.0 (Kubeflow 배포판 포함) | Kustomize (Kubeflow) |
| **개발 환경** | 로컬 Jupyter | Kubeflow Notebooks (클러스터 내 컨테이너) | Kustomize (Kubeflow) |
| **GPU 자원 관리** | 미지원 (독점 사용) | GPU 타임슬라이싱(Time-Slicing)으로 4분할 공유 | Helm Chart |

모든 인프라 및 플랫폼 컴포넌트는 GitOps 도구인 Argo CD ApplicationSet을 통해 선언적으로 자동 배포됩니다. 실습은 다음 순서로 진행됩니다.

1. [플랫폼 일괄 설치 및 상태 확인](./2-lab0-platform-install.md)
2. [단일 GPU 타임슬라이싱 구성](./3-lab0-gpu-time-slicing.md)
3. [PR 단위 프리뷰(Preview) 환경 격리](./4-lab0-pr-preview.md)
4. [실습 환경 정리 및 자원 회수](./5-lab0-cleanup.md)

## 오브젝트 스토리지 엔드포인트 변경 안내

원작의 MinIO 엔드포인트는 SeaweedFS의 S3 호환 API 엔드포인트로 대체됩니다. 인증 계정 정보는 KFP 기본값을 그대로 유지하여 호환성을 보장합니다.

| 접속 위치 | 원작 (MinIO) | 본 핸즈온 (SeaweedFS S3 API) |
|---|---|---|
| **클러스터 내부** | `http://minio-service.kubeflow.svc.cluster.local:9000` | `http://seaweedfs.kubeflow.svc.cluster.local:8333` |
| **로컬 환경(Port-forward)** | `http://localhost:9000` | `http://localhost:8333` |
| **인증 계정** | `minio` / `minio123` | 동일 (KFP Secret `mlpipeline-minio-artifact` 기본값) |

스토리지는 원작의 예제가 요구하는 버킷 구조를 그대로 생성합니다: `feature-data-sets`, `feature-registry`, `mlflow-datasets`, `inference-datasets` 및 MLflow 아티팩트용 `mlflow-artifacts` (총 5개 버킷).

## 부록: 컴포넌트 선별 기준

Kubeflow 전체 배포판에는 Katib, Trainer, Spark Operator, Knative, Kubeflow Model Registry 등 대규모 분산 환경용 컴포넌트들이 포함되어 있습니다. 본 실습(Part 2: 4~6장)에서는 단일 노드 리소스(메모리)를 최적화하고 학습 목적에 집중하기 위해 불필요한 컴포넌트를 제외했습니다.

| 제외된 컴포넌트 | 제외 사유 |
|---|---|
| **Katib** | 하이퍼파라미터 튜닝 컴포넌트로 본 실습 범위 외 |
| **Trainer, Spark Operator** | 대규모 분산 학습 및 Spark용으로, 본 실습의 단일 노드 학습 범위 외 |
| **Knative** | KServe를 경량화된 Standard(RawDeployment) 모드로 운영하므로 불필요 |
| **Kubeflow Model Registry** | 업계 표준으로 널리 사용되는 MLflow Model Registry를 단일 레지스트리로 활용 |

> [!NOTE]
> MLflow는 공식 Helm 차트가 제공되지 않으므로, 검증된 커뮤니티 차트(`community-charts/mlflow` 1.11.7)를 Kustomize의 `helmCharts` 기능으로 관리합니다. 상세한 아키텍처 결정 배경은 [knowledge/decisions](../knowledge/decisions/index.md)를 참고하세요.
