---
type: Decision
title: EKS addon 버전을 넘기지 않고 self-managed 기본 설치에 맡긴다
description: 1.36 addon 버전을 조회할 수 없는 상태에서 버전을 추측해 박지 않고, EKS가 클러스터 버전에 맞춰 설치하는 self-managed addon을 쓴다.
tags: [eks, terraform, addon]
timestamp: 2026-09-23T00:00:00Z
---

# EKS addon 버전을 넘기지 않고 self-managed 기본 설치에 맡긴다

## 결정

- terraform/eks는 모듈에 `eks_addons = []`를 넘긴다
- vpc-cni, kube-proxy, coredns는 EKS가 클러스터 생성 때 self-managed로 설치한다. 모듈이 `bootstrap_self_managed_addons = true`로 클러스터를 만들기 때문이다

## 이유

- 처음 계획은 `aws eks describe-addon-versions`로 1.36 버전을 조회해 명시하는 것이었다. 작성 시점에 AWS 세션이 없어 조회하지 못했다
- 조회 없이 적은 버전은 apply에서 실패하거나 1.36과 맞지 않는다. self-managed 설치는 EKS가 클러스터 버전에 맞춰 고르므로 이 문제가 없다
- 이 핸즈온의 주제는 노드 OS다. addon을 managed로 관리하는 이득(버전 업그레이드 API)은 주제 밖이다

## 되돌릴 때

- managed addon이 필요하면 [terraform/eks/eks.tf](../../terraform/eks/eks.tf) 주석의 명령으로 버전을 조회해 `eks_addons`에 넣는다. vpc-cni는 `before_compute = true`다
