---
type: Decision
title: Lab 1의 Kubeflow 예제는 KFP 파이프라인으로 만들고 모델 버전은 MLflow 레지스트리에 둔다
description: Katib와 Kubeflow Model Registry 없이 KFP만으로 EDA, 실험 비교, 등록 자동화를 보여 준다
tags: [kubeflow, kfp, mlflow]
timestamp: 2026-10-31T00:00:00Z
---

## 결정

- 시나리오 7, 8, 9의 Kubeflow 예제는 `notebooks/pipelines/`의 KFP 파이프라인 3개로 만든다. 노트북 터미널에서 `kfp.Client()`로 제출한다.
- 실험 비교는 KFP experiment와 Metrics 아티팩트로, 등록은 MLflow 레지스트리로 한다. Katib와 Kubeflow Model Registry는 설치하지 않는다.
- 컴포넌트 이미지는 노트북과 같은 `jupyter-scipy` 이미지에 필요한 패키지만 `packages_to_install`로 더한다.

## 이유

- 책 5장의 흐름이 MLflow로 실험하고 KFP로 같은 작업을 파이프라인으로 돌리는 것이다. 책도 모델은 MLflow에서 꺼낸다.
- 배포판에 Model Registry를 더하면 레지스트리가 둘이 되고, 이후 Lab의 KServe가 `models:/income-classifier@champion`을 쓰는 흐름과 어긋난다.
- 노드에 이미 받아 둔 이미지를 쓰면 컴포넌트 파드가 빨리 뜨고 이미지를 따로 빌드할 필요가 없다.

## 관련

- [노트북은 Kubeflow Notebook으로 만들고 접속 정보는 PodDefault로 넣는다](2026-10-kubeflow-notebook-poddefault.md)
