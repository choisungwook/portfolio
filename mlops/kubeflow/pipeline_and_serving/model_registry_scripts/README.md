# 개요

* kubeflow model registry에 등록된 AI모델 정보를 가져오는 파이썬 스크립트
* 파이썬 스크립트는 쿠버네티스 job으로 실행

## 목차

### 1. AI모델 이름으로 정보조회: [get_models_from_modelregistry.yaml](./get_models_from_modelregistry.yaml)

```sh
$ kubectl logs job/get-mnist-model -n kubeflow-user-example-com
name='c0c8c5' id='5' description='MINST model description' external_id=None create_time_since_epoch='1755441545734' last_update_time_since_epoch='1755441545734' custom_properties=None author='akbun' state=<ModelVersionState.LIVE: 'LIVE'> registered_model_id='4'
```

### 2. artifact 조회: [get_artifact_of_model.yaml](./get_artifact_of_model.yaml)


```sh
$ kubectl -n kubeflow-user-example-com logs job/get-artifact-of-model
<string>:3: UserWarning: User access token is missing
id='3' description=None external_id=None create_time_since_epoch='1755441545749' last_update_time_since_epoch='1755441545749' custom_properties=None name='mnist' uri='minio://mlpipeline/v2/artifacts/mnist-pipeline/5df0cd85-5615-4b99-8c17-a16f018c6819/train-mnist-model/85a61675-3c0b-4120-a6c6-dd9c66d42eed/trained_model' state=<ArtifactState.UNKNOWN: 'UNKNOWN'> model_format_name='onnx' model_format_version='1' storage_key=None storage_path=None service_account_name=None model_source_kind=None model_source_class=None model_source_group=None model_source_id=None model_source_name=None
```
