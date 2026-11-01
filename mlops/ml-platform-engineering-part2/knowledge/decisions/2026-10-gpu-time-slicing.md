---
type: Decision
title: GPU 한 장을 DRA 대신 NVIDIA device plugin time-slicing으로 나눈다
description: Kubeflow Notebook UI와 KServe가 nvidia.com/gpu limit으로 GPU를 요청하므로 그 방식과 맞는 공유 방법을 골랐다
tags: [gpu, k3s, kserve, kubeflow]
timestamp: 2026-10-31T00:00:00Z
---

## 결정

- NVIDIA device plugin Helm chart 0.20.1에 time-slicing `replicas: 4`를 준다. 노드는 `nvidia.com/gpu: 4`를 알린다.
- k3s를 `--default-runtime=nvidia`로 설치한다. Notebook과 KServe 파드는 `runtimeClassName`을 지정하지 않기 때문이다.
- chart 기본 affinity가 NFD label을 요구해 `affinity: null`로 지운다.

## 이유

- 노트북 하나가 GPU를 잡으면 KServe 서빙과 파이프라인이 GPU를 받지 못한다. GPU가 한 장뿐이라 공유가 필요하다.
- DRA는 ResourceClaim으로 GPU를 요청한다. Kubeflow Notebook UI의 GPUs 항목과 KServe는 `nvidia.com/gpu` limit을 쓰므로 DRA를 쓰면 이 경로가 동작하지 않는다.
- RTX 5060 Ti는 MIG를 지원하지 않는다. time-slicing만 남는다.
- 감수: time-slicing은 메모리를 격리하지 않는다. 16GB를 모든 파드가 나눠 쓰므로 LLM 서빙 모델 크기를 그 안에서 고른다.
