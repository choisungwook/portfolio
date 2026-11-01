# Lab 1 시나리오 1. ML 수명주기(Lifecycle)와 오픈소스 MLOps 플랫폼 로드맵

## 도구가 아닌 MLOps 플랫폼의 '기능'에 집중합니다

Lab 0에서 인프라와 플랫폼을 설치했다면, Lab 1에서는 **ML 엔지니어와 데이터 사이언티스트에게 MLOps 플랫폼이 실제로 어떤 가치와 기능을 제공하는지**를 단계별로 실습합니다. 

Kubeflow와 MLflow 같은 오픈소스는 그 자체가 목적이 아니라 플랫폼의 특정 기능을 구현하기 위한 부품입니다. 본 핸즈온에서 구성한 도구 조합은 도서 *Machine Learning Platform Engineering* Part 2의 구성을 현대적 오픈소스로 재해석한 것입니다.

아래 로드맵은 Lab 1에서 다루는 기능의 전체 흐름을 보여줍니다.

![Lab 1 MLOps 플랫폼 로드맵](../imgs/mlops-lab1-roadmap-vertical.png)

## 머신러닝 수명주기(ML Lifecycle)와 플랫폼 기능 지도

머신러닝 프로젝트는 비즈니스 요구사항에서 출발하여 데이터 분석, 모델 개발, 검증을 거쳐 최종 사용자에게 서빙되기까지 일련의 단계를 거칩니다. MLOps 플랫폼은 이 각 단계가 파편화되지 않고 유기적으로 연결되도록 돕습니다.

```mermaid
flowchart TB
  REQ[비즈니스 요구사항 정의] --> DEF[문제 정의 및 가설 수립]
  SRC[(데이터 소스<br/>UCI Adult)] --> FS
  ENV[표준 개발 환경<br/>Kubeflow Notebooks] -.->|실험 코드 실행| PIPE
  subgraph PIPE[파이프라인 오케스트레이션 · Kubeflow Pipelines]
    direction TB
    EDA[탐색적 데이터 분석, EDA] --> TRAIN[모델 학습 및 튜닝] --> EVAL[모델 성능 평가]
  end
  DEF --> EDA
  FS[피처 스토어<br/>Feast, Redis] --> TRAIN
  TRAIN -->|"파라미터 / 메트릭 로깅"| TRK[실험 추적<br/>MLflow Tracking]
  EVAL -->|검증 통과 모델 등록| REG[모델 레지스트리<br/>MLflow Model Registry]
  REG -->|"models:/...@champion"| SRV[모델 서빙<br/>KServe]
  FS -->|실시간 추론 피처 조회| SRV
  SRV <--> USER[최종 사용자 및 서비스]
  SRV --> MON[운영 모니터링 및 재학습<br/>(원작 6장)]
  TRK --- OBJ[(오브젝트 스토리지 SeaweedFS<br/>메타데이터 DB PostgreSQL)]
  REG --- OBJ

  classDef run fill:#e3f4ec,stroke:#1f6f50,color:#0b3b2a
  classDef store fill:#fdeee6,stroke:#e2622b,color:#7a2e0e
  classDef out fill:#f3f3f1,stroke:#d4d4d0,color:#9a9a96
  class ENV,EDA,TRAIN,EVAL run
  class TRK,REG,FS,SRV,OBJ store
  class REQ,DEF,SRC,USER,MON out
```

### 기능별 오픈소스 매핑 및 실습 시나리오

| 플랫폼 기능 | 엔지니어와 조직이 얻는 가치 | 활용 오픈소스 | 상세 시나리오 |
|---|---|---|---|
| **모델 레지스트리** | 모델을 명확한 이름, 버전, 배포 별칭(Alias)으로 패키징 및 단일 진입점 관리 | MLflow Model Registry | [시나리오 2](./7-lab1-model-registry.md), [시나리오 6](./11-lab1-registry-reproducibility.md) |
| **표준화된 개발 환경** | GPU, 공유 스토리지, 접속 정보가 사전 주입된 격리 노트북 제공 | Kubeflow Notebooks | [시나리오 3](./8-lab1-kubeflow-notebook.md) |
| **탐색적 데이터 분석(EDA)** | 데이터 품질 분석 결과와 원본 데이터셋 버전을 투명하게 기록 보관 | MLflow, Kubeflow Pipelines | [시나리오 4](./9-lab1-eda.md) |
| **실험 추적 (Tracking)** | 하이퍼파라미터, 평가 지표, 학습 데이터를 Run 단위로 로깅하여 객관적 비교 | MLflow Tracking | [시나리오 5](./10-lab1-experiment-lineage.md) |
| **파이프라인 오케스트레이션** | 전처리부터 학습·평가까지 정해진 워크플로우를 무상태 파드로 자동 반복 실행 | Kubeflow Pipelines (KFP) | [시나리오 4](./9-lab1-eda.md)~[시나리오 6](./11-lab1-registry-reproducibility.md) |
| **모델 서빙** | 레지스트리에 등록된 모델을 즉시 호출 가능한 고성능 HTTP API로 배포 | KServe (Standard 모드) | [시나리오 7](./12-lab1-model-serving.md) |
| **피처 스토어** | 오프라인(학습)과 온라인(서빙) 환경 간 동일한 피처 값을 일관되게 제공 (Skew 방지) | Feast, Redis | [시나리오 8](./13-lab1-feature-store.md) |

## 왜 '모델 레지스트리'부터 먼저 실습하는가?

MLOps 플랫폼이 모델을 다루는 방식은 소프트웨어 엔지니어링에서 컨테이너 이미지를 다루는 방식과 매우 흡사합니다. 

- **소프트웨어 개발**: 개발팀이 도커 이미지를 빌드하여 레지스트리에 `push`하면, 운영팀이나 배포 시스템은 어떤 개발 환경에서 빌드되었는지 상관없이 `image:tag`만으로 `pull`하여 배포합니다.
- **머신러닝 개발**: 연구자의 개인 노트북이나 임시 디렉토리에만 존재하는 가중치 파일(`.pkl`, `.pt`)은 배포 시스템이 자동으로 가져갈 방법이 없습니다.

모델 레지스트리는 모델 아티팩트를 `models:/<이름>@<alias>`라는 단일한 논리적 주소로 등록(push)하고 소비(pull)할 수 있게 해주는 MLOps의 핵심 접점입니다. 서빙 인프라와 파이프라인, 서비스 개발팀은 오직 이 레지스트리 주소만 바라보면 됩니다.

따라서 Lab 1에서는 모델을 소비하는 최종 계약점인 **모델 레지스트리의 개념과 동작(Push/Pull)을 먼저 경험**합니다. 이를 통해 "배포 시스템에 안전하게 넘길 수 있는 모델이란 무엇인가?"를 이해한 후, 역으로 거슬러 올라가며 개발 환경 구성, 데이터 분석(EDA), 모델 실험 및 선정 과정을 체계적으로 학습하게 됩니다.

### Lab 1 실습 순서

1. [모델 레지스트리: 도커 이미지처럼 모델 등록 및 관리(Push & Pull)](./7-lab1-model-registry.md)
2. [표준화된 개발 환경: Kubeflow Notebooks와 플랫폼 연동](./8-lab1-kubeflow-notebook.md)
3. [탐색적 데이터 분석(EDA)과 Kubeflow Pipelines 기반 실행 자동화](./9-lab1-eda.md)
4. [실험 추적(Tracking)과 데이터 계보(Lineage) 관리](./10-lab1-experiment-lineage.md)
5. [Champion 모델 승격과 모델 재현성(Reproducibility) 검증](./11-lab1-registry-reproducibility.md)
6. [모델 서빙: KServe를 통한 프로덕션 레벨 HTTP API 배포](./12-lab1-model-serving.md)
7. [피처 스토어(Feast): 학습-서빙 간 피처 일관성 보장 및 왜곡(Skew) 방지](./13-lab1-feature-store.md)
