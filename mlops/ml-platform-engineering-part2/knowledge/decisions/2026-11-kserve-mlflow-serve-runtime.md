---
type: Decision
title: MLflow 모델은 배포판 MLServer 대신 모델의 requirements.txt를 설치하는 런타임으로 서빙한다
description: 고정된 라이브러리 버전의 런타임은 새 버전으로 저장한 모델을 오류 없이 틀리게 예측한다
tags: [kserve, mlflow, serving, xgboost]
timestamp: 2026-11-01T00:00:00Z
---

## 결정

- `income-classifier`는 ServingRuntime `mlflow-serve`로 서빙한다. `python:3.12.13-slim`에서 모델의 `requirements.txt`를 설치하고 `mlflow models serve --env-manager local`로 띄운다.
- KServe용 S3 계정은 Argo CD가 관리하는 `mlflow-access`에 annotation을 더하지 않고 `manifests/kserve-inference/`의 Secret `kserve-s3`로 따로 둔다.
- `storageUri`는 MLflow REST API로 `champion`의 LoggedModel 경로를 구해 넣는다. KServe는 `models:/` 주소를 모른다.

## 이유

- 배포판 `kserve-mlserver`(seldonio/mlserver:1.7.1)는 xgboost 3.0.2, mlflow 2.22.1, Python 3.10이다. xgboost 3.4.1로 저장한 모델이 Ready, HTTP 200으로 서빙됐지만 모든 예측의 logit이 약 1.11 밀렸다.
- `ghcr.io/mlflow/mlflow:v3.17.2` 이미지는 Python이 낮아 xgboost 3.4.1을 설치하지 못했다.
- `mlflow-access`에 kubectl로 annotation을 붙이면 Argo CD self-heal이 Git 상태로 되돌려 storage initializer가 AWS 기본 주소로 가 403이 났다.
- 파드마다 패키지를 설치해 Ready까지 2분쯤 걸린다. 실습 규모에서는 이미지를 빌드하는 비용보다 작다고 봤다.

## 관련

- [배포판 KServe를 Standard 모드로 바꾸고 Ingress 생성을 끈다](2026-10-kserve-standard-without-ingress.md)
