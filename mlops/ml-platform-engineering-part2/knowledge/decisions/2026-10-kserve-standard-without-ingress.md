---
type: Decision
title: 배포판 KServe를 Standard 모드로 바꾸고 Ingress 생성을 끈다
description: Knative를 설치하지 않고 predictor Service에 port-forward로 접근하는 최소 구성
tags: [kserve, serving, kubeflow]
timestamp: 2026-10-31T00:00:00Z
---

## 결정

- 배포판 release-26.03.1 브랜치의 KServe(v0.19.0, `kubeflow` namespace)를 `kubeflow/kserve` wrapper로 가져온다.
- `inferenceservice-config`를 patch해 `defaultDeploymentMode: Standard`, `disableIngressCreation: true`.

## 이유

- 배포판 KServe의 기본은 Serverless(Knative)다. Knative와 cluster-local-gateway를 빼면 Standard 모드로 바꿔야 InferenceService가 뜬다.
- Lab 0~4a는 클러스터 밖 공개가 필요 없다. Gateway는 Lab 4b의 `LLMInferenceService`에서 필요할 때 더한다.
- 배포판 브랜치는 릴리스 노트(26.03.1, KServe 0.18.0)보다 앞서 있다. 실제 버전은 렌더링 결과의 이미지 태그로 확인한다.
