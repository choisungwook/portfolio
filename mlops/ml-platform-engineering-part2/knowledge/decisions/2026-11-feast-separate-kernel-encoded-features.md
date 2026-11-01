---
type: Decision
title: Feast는 노트북 안 전용 커널에서 쓰고, one-hot 인코딩한 피처를 저장한다
description: 피처 스토어 시나리오에서 환경 충돌을 피하고 서빙 쪽 인코딩 코드를 없애려는 선택
tags: [feast, feature-store, redis, notebook]
timestamp: 2026-11-01T00:00:00Z
---

## 결정

- Feast 0.67.0은 노트북 파드의 `~/.venvs/feast` 가상환경과 Jupyter 커널 `feast`에 설치한다. `notebooks/feast/requirements.txt`에 `s3fs`를 함께 둔다.
- 피처는 원본 범주 컬럼 8개가 아니라 one-hot 인코딩한 90개를 `person_id`마다 저장한다. FeatureView는 schema 없이 parquet 컬럼에서 피처를 읽는다.
- Feast UI는 공식 Helm chart `feast-feature-server` 0.67.0을 UI 모드로 platform ApplicationSet에 둔다. 노트북 안에서 `feast ui`를 띄우는 방식은 터미널을 닫으면 꺼지고 port-forward 대상이 노트북 파드라 버렸다(2026-11-01). Feast Operator와 online feature server는 설치하지 않는다.

## 이유

- `feast[aws,redis]==0.67.0`을 노트북 기본 환경에 설치하면 pandas가 3.0.3에서 2.3.3으로, boto3가 내려간다. MLflow 노트북과 저장한 모델 환경을 건드리지 않으려 했다.
- 오프라인 스토어를 S3에서 읽는 dask가 `s3fs`를 요구하는데 `feast[aws]`에 포함되지 않는다.
- 인코딩을 피처를 만들 때 한 번만 하면 KServe를 부르는 쪽에 인코딩 코드가 필요 없다. 범주가 늘면 피처와 모델을 다시 만들어야 하는 비용은 감수한다.
- Lab 1의 목표는 학습과 서빙이 같은 값을 받는 것을 보는 것이라 SDK와 Redis로 충분하다. UI는 레지스트리만 읽으므로 chart 하나와 S3 계정만 있으면 된다.

## 관련

- [MLflow 모델은 모델의 requirements.txt를 설치하는 런타임으로 서빙한다](2026-11-kserve-mlflow-serve-runtime.md)
