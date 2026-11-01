---
type: Decision
title: Kubeflow로 할 수 있는 구성요소는 Kubeflow 배포판에서 가져온다
description: KFP standalone과 일반 JupyterLab 대신 Community Distribution 26.03.1의 구성요소를 ApplicationSet으로 설치한다
tags: [kubeflow, argocd, plan-change]
timestamp: 2026-10-31T00:00:00Z
---

## 결정

- 배포판 `example/kustomization.yaml`의 resources를 구성요소마다 Application 하나로 옮긴다(`kubeflow-applicationset.yaml`). cert-manager, Istio, oauth2-proxy, Dex, KFP(multi-user), Central Dashboard, Notebooks, Profile, KServe, KServe UI.
- 빼는 것: Knative, Katib, Trainer, Spark Operator, Model Registry(Kubeflow Hub). Part 2에서 쓰지 않는다.
- 고친 구성요소 세 개만 이 저장소의 wrapper를 거친다. Istio(k3s CNI 경로), KFP(seaweedfs NetworkPolicy 삭제, 버킷 Job), KServe(Standard 모드, Ingress 생성 끔).
- object storage(SeaweedFS)는 KFP가 설치하는 것을 그대로 쓴다. MLflow는 community-charts Helm chart, Kubeflow는 kustomize만 쓴다.

## 이유

- 책 Part 2의 목표가 MLflow와 Kubeflow로 MLOps 이론을 실습하는 것이라, 노트북과 UI까지 Kubeflow 구성요소로 확인한다. 플래닝은 입문자 시간을 이유로 standalone을 골랐지만, Kubeflow 관점의 실습(UI, Notebook, PodDefault)이 빠졌다.
- 배포판 전체를 한 Application으로 렌더링하면 원격 base를 한 번에 수십 번 clone해 repo-server timeout 위험이 있고, 어느 구성요소가 실패했는지 보이지 않는다.
- k3s는 CNI 파일을 `/var/lib/rancher/k3s/data/cni`, `/var/lib/rancher/k3s/agent/etc/cni/net.d`에 둔다. 배포판의 istio-cni-node는 `/opt/cni/bin`, `/etc/cni/net.d`를 쓰므로 hostPath를 바꾼다.
- 배포판의 KServe는 Serverless(Knative) 기본이라, Knative를 빼면 Standard 모드로 바꿔야 InferenceService가 뜬다.
