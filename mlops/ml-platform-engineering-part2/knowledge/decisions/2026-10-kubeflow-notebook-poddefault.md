---
type: Decision
title: 노트북은 Kubeflow Notebook으로 만들고 접속 정보는 PodDefault로 넣는다
description: 일반 JupyterLab Deployment를 버리고 Kubeflow Notebooks의 PodDefault로 MLflow와 object storage 접속 정보를 주입한다
tags: [kubeflow, notebooks, mlflow]
timestamp: 2026-10-31T00:00:00Z
---

## 결정

- 사용자 namespace `kubeflow-user-example-com`에 PodDefault `mlflow-access`와 Secret을 둔다(`kubeflow/user-resources`). 노트북을 만들 때 UI의 Configurations에서 고르면 `MLFLOW_TRACKING_URI`, `AWS_ENDPOINT_URL`, S3 계정이 파드에 들어간다.
- kubectl 경로용으로 `manifests/kubeflow-notebook/`에 PVC와 Notebook 리소스를 두되 Argo CD는 관리하지 않는다. 사용자가 UI에서 지우고 다시 만드는 리소스라서다.
- 등록 모델 이름은 책의 `random-forest-classifier` 대신 `income-classifier`를 쓴다. 최고 점수 모델이 XGBoost여서 알고리즘 이름이 맞지 않는다.

## 이유

- 처음에는 Kubeflow Notebooks가 Istio와 인증 묶음을 끌고 와서 JupyterLab Deployment로 PodDefault만 흉내 냈다. 배포판을 설치하기로 바꾸면서 그 이유가 사라졌다.
- 노트북 코드에 주소와 계정이 없으면 같은 코드를 KFP 컴포넌트로 옮길 때 고칠 것이 없다.
