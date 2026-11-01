# Lab 1 시나리오 2. 모델을 도커 이미지처럼 레지스트리에 올리고 꺼냅니다

## 이 시나리오의 목표

| 항목 | 내용 |
|---|---|
| 플랫폼 기능 | 모델 레지스트리 |
| 오픈소스 | MLflow Model Registry |
| 작업 | 1. 작은 모델을 학습해 `quickstart-model`로 등록(push) 2. `models:/quickstart-model@champion`으로 꺼내 예측(pull) 3. 다시 push해 alias가 새 버전을 가리키는지 확인 |
| 달성할 것 | 모델을 쓰는 쪽이 학습 코드와 run을 몰라도 이름과 alias만으로 모델을 받음 |

[시나리오 1](./6-lab1-mlops-platform.md)에서 레지스트리를 도커 레지스트리에 빗댔습니다. 이 시나리오는 그 비유를 그대로 실행해 봅니다. 모델은 아직 실험으로 고른 것이 아니라 scikit-learn에 들어 있는 데이터로 바로 학습한 임시 모델입니다. 레지스트리에 올릴 진짜 모델은 시나리오 3~6에서 만듭니다.

## 도커 레지스트리와 모델 레지스트리는 같은 일을 다른 단위로 합니다

| 도커 레지스트리 | MLflow Model Registry |
|---|---|
| 이미지 저장소 이름 `myapp` | registered model 이름 `quickstart-model` |
| digest `sha256:...` | model version `1`, `2`, ... (등록할 때마다 1씩 증가) |
| tag `stable` | alias `champion` |
| `docker push myapp:stable` | `log_model(..., registered_model_name=...)` 후 `set_registered_model_alias` |
| `docker pull myapp:stable` | `mlflow.pyfunc.load_model("models:/quickstart-model@champion")` |

다른 점이 하나 있습니다. 도커 tag는 이미지를 올리는 쪽이 정하지만, MLflow version은 레지스트리가 붙입니다. 사람이 고르는 것은 alias 하나이고, alias를 옮기면 모델을 쓰는 쪽 코드를 바꾸지 않고 모델이 바뀝니다.

## alias는 배포 역할, tag는 모델의 속성을 적습니다

`champion`, `challenger`는 소프트웨어 이미지 tag에서는 보기 어려운 이름입니다. 이 이름은 버전이 아니라 역할을 가리킵니다. 지금 트래픽을 받는 모델이 champion이고, 그 자리를 노리며 비교받는 후보가 challenger입니다. 소프트웨어 배포의 `stable`과 `canary`에 해당합니다.

| 이름 | 종류 | 가리키는 것 | 소프트웨어 배포에서 비슷한 것 |
|---|---|---|---|
| `champion` | alias | 지금 서빙하는 버전. 버전 하나에만 붙음 | `stable`, `prod` tag |
| `challenger` | alias | champion과 비교 중인 후보 버전 | `canary`, `rc` |
| `validation_status: approved` | tag | 버전의 검증 상태. 여러 버전에 붙을 수 있음 | 이미지 label, 서명 |
| version `1`, `2` | 레지스트리가 붙이는 번호 | 바뀌지 않는 버전 하나 | digest |

이름 자체를 정한 표준은 없습니다. alias는 아무 문자열이나 쓸 수 있고, `champion`과 `challenger`는 아래 문서들이 예시로 쓰면서 관례가 됐습니다.

- MLflow 공식 문서는 alias를 "버전을 가리키는 바뀔 수 있는 이름"으로 정의하고 `models:/MyModel@champion`을 예로 듭니다. tag는 `validation_status: approved`처럼 상태와 분류에 씁니다.
- Databricks 문서는 Unity Catalog로 옮기면서 stage(`Staging`, `Production`) 대신 alias를 쓰라고 하고, 승인 뒤 CI/CD가 `Champion` alias를 옮기는 흐름을 예로 듭니다.

책은 stage `Production`을 쓰지만, stage는 버전마다 하나뿐이라 "운영 중인 모델"과 "비교 중인 후보"를 동시에 표현하기 어렵습니다. 그래서 MLflow 2.9부터 alias와 tag로 나눠 쓰는 방식으로 바뀌었습니다. 이 Lab은 `champion` 하나만 쓰고, 시나리오 6의 Kubeflow 예제가 점수가 더 높을 때만 `champion`을 옮깁니다.

## 모델은 가중치와 설정이고, MLflow는 그것을 실행 환경과 함께 묶습니다

모델이 "학습으로 정한 값(가중치)과 그 값을 쓰는 구조(설정)"라는 이해는 머신러닝 모델에도 맞습니다. 값의 모양만 다릅니다.

| 모델 | 학습으로 정한 값 | 구조와 설정 |
|---|---|---|
| 신경망(LLM 등) | 층마다의 가중치 행렬 | 층 수, 차원 같은 `config.json` |
| 로지스틱 회귀(이 시나리오) | 입력 컬럼 30개의 계수와 절편 | 입력 컬럼 순서, 정규화 방식 |
| XGBoost(시나리오 5) | 트리 30개의 분기 조건과 잎 값 | `max_depth`, `objective` 같은 파라미터 |

MLflow 모델은 압축 파일이 아니라 디렉터리입니다. 가중치와 설정은 그중 파일 하나에 들어 있고, 나머지 파일은 그 파일을 다른 곳에서 다시 불러와 실행하는 데 필요한 정보입니다. 시나리오 6에서 등록할 XGBoost 모델의 디렉터리를 내려받아 보면 이렇습니다.

```text
MLmodel                     7830   어떤 라이브러리로 불러오는지(flavor), 입력 스키마(signature)
model.ubj                 220486   XGBoost가 저장한 트리 30개. 가중치와 설정이 여기 있음
python_env.yaml, conda.yaml,
requirements.txt                   불러올 때 필요한 Python과 패키지 버전(xgboost==3.4.1 등)
input_example.json                 입력 예시 3행
serving_input_example.json         서빙 API에 보낼 요청 본문 예시
```

`MLmodel`의 flavor가 핵심입니다. XGBoost 모델은 `xgboost` flavor와 `python_function` flavor를 함께 가집니다. `python_function`은 어떤 라이브러리로 만든 모델이든 `load_model(...).predict(DataFrame)` 하나로 부르게 해 주는 공통 인터페이스입니다. 이 시나리오의 scikit-learn 모델도 파일 이름만 `model.skops`일 뿐 같은 방식으로 꺼냅니다.

## Hugging Face Hub와 MLflow는 같은 기능을 다른 범위로 제공합니다

모델 파일을 버전으로 올리고 이름으로 꺼낸다는 핵심 기능은 같습니다. 차이는 레지스트리가 모델 바깥의 무엇과 연결되느냐입니다.

| 항목 | Hugging Face Hub | MLflow Model Registry |
|---|---|---|
| 모델 파일 | `config.json`과 `model.safetensors` 같은 라이브러리 고유 파일 | 라이브러리 고유 파일 + `MLmodel`, 환경 파일 |
| 버전 | git commit, branch, tag(`revision`) | 등록할 때 붙는 정수 version과 alias |
| 학습 기록과 연결 | model card에 사람이 적음 | version마다 출처 run이 있고, run에 파라미터, 점수, 데이터셋이 남음 |
| 주 용도 | 공개 모델 공유, 사전학습 모델 배포 | 조직 안에서 실험부터 서빙까지 이어지는 모델 관리 |
| 설치 위치 | 서비스로 사용 | 이 Lab처럼 클러스터에 직접 설치 |

Hugging Face에서 받은 사전학습 모델을 미세조정하면, 결과 모델을 MLflow에 등록해 run과 연결하는 식으로 둘을 함께 쓰기도 합니다. 이 Lab은 사내 플랫폼을 만드는 관점이라 직접 설치하고 run과 연결되는 MLflow를 씁니다.

## 실습

맥북에서 실행합니다. 모델 파일은 MLflow 서버가 object storage로 중계하므로, 맥북에는 S3 계정이 필요 없습니다.

### 1. MLflow에 접속합니다

맥북의 터미널 하나에서 MLflow를 port-forward합니다.

```bash
kubectl -n mlflow port-forward svc/mlflow-service 5000:5000
```

### 2. 모델을 push합니다

다른 터미널의 `mlops/ml-platform-engineering-part2` 디렉터리에서 실행합니다. 스크립트 머리의 의존성(`mlflow`, `scikit-learn`)을 uv가 설치하므로, 첫 실행은 몇 분 걸립니다.

```bash
uv run --python 3.12 scripts/registry_quickstart.py push
```

레지스트리가 version 1을 붙이고 `champion`이 그 버전을 가리킵니다.

```text
pushed quickstart-model v1 @champion
```

### 3. 모델을 pull합니다

`pull`은 run ID 없이 이름과 alias만으로 모델을 받아 3행을 예측합니다.

```bash
uv run --python 3.12 scripts/registry_quickstart.py pull
```

```text
pulled models:/quickstart-model@champion (v1) predict=[0, 0, 0]
```

### 4. 다시 push하고 alias가 옮겨 갔는지 봅니다

같은 명령으로 push와 pull을 한 번 더 실행합니다. pull 코드는 그대로인데 받는 버전이 v2로 바뀝니다.

```text
pushed quickstart-model v2 @champion
pulled models:/quickstart-model@champion (v2) predict=[0, 0, 0]
```

`http://localhost:5000`의 **Models** 탭에서 `quickstart-model`을 열면 Version 1, 2가 있고 alias `champion`이 Version 2에 붙어 있습니다. 각 version의 **Source run**이 experiment `registry-quickstart`의 `push` run으로 이어집니다.

## 부록. 실무에서 얻는 것

- **맥북에서 MLflow를 쓸 때는 분할 다운로드를 끕니다.** MLflow 3.17 서버는 파일을 나눠 받을 object storage 주소(presigned URL)를 클라이언트에 넘깁니다. 그 주소는 클러스터 안 주소라 맥북에서 닿지 않아 다운로드가 멈춥니다. 스크립트는 `MLFLOW_ENABLE_PROXY_MULTIPART_DOWNLOAD=false`로 서버 중계만 씁니다. 경위는 [troubleshooting.md](./troubleshooting.md) 21번에 있습니다.
- **임시 모델은 다른 이름으로 올립니다.** `income-classifier`와 섞이지 않게 `quickstart-model`로 등록했습니다. 시나리오 6의 version 번호가 이 시나리오 때문에 밀리지 않습니다.

## 참고 문서

1. [MLflow Model Registry](https://mlflow.org/docs/latest/ml/model-registry/) - alias와 tag의 정의, `champion` 예시
2. [Databricks, Manage model lifecycle in Unity Catalog](https://docs.databricks.com/mlflow/models-in-uc.html) - alias로 배포 상태를 관리하는 방법
3. [Databricks, Upgrade ML workflows to target models in Unity Catalog](https://docs.databricks.com/machine-learning/manage-model-lifecycle/upgrade-workflows.html) - stage에서 alias로 옮기는 흐름, 승인 뒤 `Champion` alias 이동
