# Lab 1 시나리오 2. 모델을 만들기 전에 데이터를 들여다보고 그 결과를 남깁니다

## EDA란

EDA(Exploratory Data Analysis, 탐색적 데이터 분석)는 모델을 만들기 전에 데이터를 표와 그래프로 훑어보는 작업입니다. 어떤 컬럼이 있는지, 값이 어떻게 퍼져 있는지, 예측하려는 값과 관계가 있어 보이는 컬럼이 무엇인지를 봅니다. 여기서 본 것이 어떤 컬럼을 피처로 쓸지 정하는 근거가 됩니다.

## 이 시나리오의 목표

| 항목 | 내용 |
|---|---|
| 데이터 | UCI Adult. 1994년 미국 인구조사에서 뽑은 성인 데이터. 결측(`?`)이 있는 행을 지운 30,162행 |
| 컬럼 | 범주형 8개(직업군, 학력, 결혼 상태, 직종, 가족 관계, 인종, 성별, 출신 국가)와 정답 `Target` |
| 예측할 값 | 연소득이 5만 달러를 넘는지(`>50K`) 아닌지(`<=50K`) |
| EDA 작업 | 1. 행 수와 정답 비율 확인 2. 컬럼마다 범주 개수 확인 3. 컬럼마다 범주별 `>50K` 비율을 막대그래프 8개로 그림 |
| 달성할 것 | 소득을 가르는 컬럼을 찾고, 그 근거(그래프)와 원본 데이터를 MLflow run 하나에 남김. 같은 EDA를 Kubeflow Pipelines로도 실행 |

EDA 결과가 노트북 출력에만 있으면 커널을 다시 시작하는 순간 사라집니다. 책 4.3절은 그래프를 MLflow run의 아티팩트로 올립니다. 이 Lab은 원본 데이터도 object storage(SeaweedFS)에 올리고 run에 연결해, 다음 시나리오의 실험이 어느 데이터에서 출발했는지 추적할 수 있게 합니다.

같은 EDA를 두 가지로 해 봅니다. **MLflow 예제**는 책 4장처럼 노트북 셀을 실행하고 결과를 MLflow에 남깁니다. **Kubeflow 예제**는 책 5장처럼 같은 작업을 Kubeflow Pipelines(KFP) 파이프라인으로 실행하고 결과를 KFP에 남깁니다. 노트북은 탐색할 때, 파이프라인은 같은 작업을 반복할 때 씁니다.

## 컴포넌트 역할

| 컴포넌트 | 역할 |
|---|---|
| `01-eda.ipynb` | 데이터를 읽고 그래프 8개를 그린 뒤 `eda` run으로 기록 |
| MLflow | run과 데이터셋 정보를 PostgreSQL에 저장하고, 그래프 파일을 object storage로 넘김 |
| object storage `mlflow-artifacts` 버킷 | 그래프 파일. MLflow 서버만 씀 |
| object storage `mlflow-datasets` 버킷 | 원본 데이터 CSV. 노트북이 직접 씀 |
| `pipelines/eda_pipeline.py` | Kubeflow 예제. 컴포넌트 `load-data`, `eda-report`로 된 파이프라인을 노트북에서 제출 |
| Kubeflow Pipelines | 컴포넌트마다 파드를 띄워 실행하고, 결과 파일(아티팩트)과 입출력 연결을 기록 |
| object storage `mlpipeline` 버킷 | KFP 아티팩트. namespace마다 `private-artifacts/<namespace>/` 아래만 씀 |

## 흐름

노트북이 EDA 결과를 MLflow에 보내면, MLflow는 그래프 파일은 object storage에, run 정보는 PostgreSQL에 나눠 저장합니다.

![EDA 결과를 MLflow에 저장하는 구조](../imgs/mlops-eda-mlflow-tracking.png)

아래는 같은 흐름을 순서대로 그린 것입니다.

```mermaid
sequenceDiagram
  participant NB as 01-eda.ipynb
  participant S3D as mlflow-datasets 버킷
  participant ML as MLflow
  participant S3A as mlflow-artifacts 버킷
  NB->>S3D: 원본 CSV 업로드
  NB->>ML: eda run 시작, 원본 데이터 연결(raw)
  NB->>ML: 그래프 8개 업로드
  ML->>S3A: 그래프 저장
```

## MLflow 예제

[6-lab1-kubeflow-notebook.md](./6-lab1-kubeflow-notebook.md)에서 노트북 코드를 받은 상태에서 시작합니다. 맥북에서 MLflow 화면도 엽니다.

```bash
kubectl -n mlflow port-forward svc/mlflow-service 5000:5000
```

### 1. 노트북을 실행합니다

JupyterLab에서 `01-eda.ipynb`를 열고 **Run All Cells**를 실행합니다. 셀마다 아래를 확인합니다.

- 두 번째 셀: 데이터가 `(30162, 9)`입니다. 30,162행에 컬럼 9개입니다.
- 세 번째 셀(`describe`): `Target`의 최빈값은 `<=50K`이고 22,654행입니다. 나머지 7,508행(약 25%)이 `>50K`입니다. 정답이 한쪽으로 치우쳐 있어서, 다음 시나리오는 정확도와 함께 ROC AUC를 봅니다.
- 마지막 셀: run ID, 원본 데이터 경로, 그래프 8개의 경로를 출력합니다.

```text
raw    : s3://mlflow-datasets/income-classifier/raw/income_data.csv
artifacts: ['eda_plots/Education.png', 'eda_plots/Marital-Status.png', ...]
```

### 2. 그래프에서 소득을 가르는 컬럼을 찾습니다

`http://localhost:5000`에서 **income-classifier** experiment의 `eda` run을 열고 **Artifacts** 탭의 `eda_plots/Marital-Status.png`를 봅니다.

| 결혼 상태 | `>50K` 비율 |
|---|---|
| `Married-civ-spouse` | 45.5% |
| `Divorced` | 10.7% |
| `Never-married` | 4.8% |

결혼 상태 하나로 소득 구간이 크게 갈립니다. 이런 관찰이 다음 시나리오에서 이 컬럼을 피처로 쓰는 근거가 되고, 그 근거가 run에 남습니다.

### 3. 원본 데이터가 run에 연결됐는지 봅니다

같은 run의 **Datasets** 영역에 `income_data`가 context `raw`로 연결돼 있으면 됩니다.

## Kubeflow 예제

MLflow 예제와 같은 노트북 터미널에서 시작합니다. 파이프라인은 두 단계입니다. `load-data`가 데이터를 만들고, `eda-report`가 그 데이터를 입력으로 받아 요약 표와 그래프를 만듭니다. 단계마다 파드가 따로 뜨고, 단계 사이 데이터는 `mlpipeline` 버킷을 거쳐 전달됩니다.

```mermaid
flowchart LR
  LD[load-data 파드] -->|Dataset| ER[eda-report 파드]
  ER -->|Markdown 요약 표| KFP[(mlpipeline 버킷)]
  ER -->|HTML 그래프 8개| KFP
```

### 1. 파이프라인을 제출합니다

JupyterLab **Terminal**에서 실행합니다. 스크립트가 파이프라인을 컴파일하고, experiment `income-classifier`에 run `eda`로 제출한 뒤 끝날 때까지 기다립니다. 1~2분 걸립니다.

```bash
cd pipelines && python eda_pipeline.py
```

마지막 두 줄이 아래처럼 나오면 됩니다.

```text
submitted eda d6e9a37c-52f8-4fdd-ad05-d700c666244a
eda SUCCEEDED
```

### 2. KFP 화면에서 결과를 봅니다

Kubeflow 화면 왼쪽 메뉴 **Pipelines** → **Runs**에서 `eda` run을 엽니다. 그래프의 `eda-report` 노드를 누르고 **Visualization** 탭을 보면 요약 표와 막대그래프 8개가 나옵니다. 숫자는 MLflow 예제와 같습니다.

```text
| 행 수 | 30162 |
| <=50K | 22654 |
| >50K | 7508 (24.9%) |
| Native_country 범주 수 | 41 |
```

## 부록. 실무에서 얻는 것

- **결과가 남는 곳이 다릅니다.** MLflow 예제는 experiment와 run으로 MLflow에, Kubeflow 예제는 파이프라인 run의 아티팩트로 KFP에 남습니다. KFP는 `load-data`의 출력이 `eda-report`의 입력이 됐다는 연결도 기록합니다.
- **파이프라인 컴포넌트는 서로 import하지 않습니다.** 컴포넌트 함수의 소스가 그대로 파이프라인 YAML에 들어가 각자 파드에서 실행됩니다. 그래서 `load-data`는 `income.py`를 부르지 않고 같은 처리를 직접 합니다.
- **입력이 같으면 KFP가 결과를 다시 씁니다.** 두 번째 실행부터 `load-data`는 캐시를 써서 건너뜁니다. 다음 시나리오의 학습 파이프라인도 같은 컴포넌트를 써서 캐시를 공유합니다.

- **MLflow는 모델만 기록하는 도구가 아닙니다.** 그래프, 리포트, 원본 데이터 경로도 run에 남깁니다. 같은 experiment를 열면 다른 사람이 EDA부터 이어받습니다.
- **그래프를 올릴 때 S3 계정이 필요 없습니다.** MLflow가 아티팩트를 중계(proxied artifact)하도록 설정해서, 노트북은 파일을 MLflow에 보내고 MLflow가 버킷에 씁니다.
- **데이터셋은 복사되지 않습니다.** `log_input`은 데이터의 경로, 내용 해시(digest), 스키마만 저장합니다. 원본 파일을 지우면 기록은 남아도 데이터는 되살릴 수 없습니다.
- **`Native_country`는 범주가 41개입니다.** 다음 시나리오에서 one-hot 인코딩하면 컬럼이 크게 늘어납니다. EDA에서 범주 개수를 먼저 보는 이유입니다.
