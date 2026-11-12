---
type: Decision
title: EC2는 서울, EKS는 us-west-2 Auto Mode로 실습한다
description: EKS sandboxing이 US 리전과 1.36 이상만 지원해서 리전을 나누고, 커스텀 AMI가 필요 없는 Auto Mode를 고른 이유
tags: [aws, nitro-sandboxes, eks, ec2]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-11T00:30:00Z }
sources:
  - id: eks-sandboxing
    resource: https://docs.aws.amazon.com/eks/latest/userguide/sandboxing.html
    title: Sandboxing on Amazon EKS
  - id: eks-isolated
    resource: https://docs.aws.amazon.com/eks/latest/userguide/sandboxing-isolated-setup.html
    title: Run a pod in isolated mode
---

## 결정

- EC2 실습(terraform/ec2)은 저장소 기본 리전인 ap-northeast-2에 둔다.
- EKS 실습(terraform/eks)은 us-west-2, Kubernetes 1.37, Auto Mode로 만든다.

## 이유

- EC2 Nitro Sandboxes는 모든 상용 리전에서 되지만, EKS의 isolated, confidential pod은 2026-11 출시 시점에 US 상용 리전과 Kubernetes 1.36 이상만 지원한다[^eks-sandboxing].
- 관리형 노드그룹은 Nitro Sandbox runtime을 넣은 커스텀 AMI 빌드와 launch template의 Enclaves 설정이 필요하다. Auto Mode는 Sandbox를 요구하는 pod을 보면 Enclaves를 켠 노드를 직접 띄운다[^eks-isolated]. 실측에서도 `c8a.large` 노드가 40초 안에 떴다.
- 관리형 노드그룹 경로는 [7-next-steps.md](../../docs/7-next-steps.md)의 과제 10으로 남겼다. 서울 리전에 EKS sandboxing이 열리면 리전을 합칠 수 있다.
