---
type: Decision
title: object storage NetworkPolicy는 지우지 않고 label 기반 허용 정책을 더한다
description: Kubeflow 배포판은 namespace 단위로 통신을 막아서 정책 하나를 지워도 풀리지 않는다
tags: [kubeflow, seaweedfs, networkpolicy, k3s]
timestamp: 2026-10-31T00:00:00Z
---

## 결정

- 배포판의 `seaweedfs` NetworkPolicy는 그대로 둔다.
- `manifests/kubeflow/pipelines/`에 `seaweedfs-allow-s3-clients` 정책을 더한다. `mlops-part2/s3-access: "true"` label이 붙은 namespace에서 8333 포트를 허용한다.
- `mlflow` namespace에 그 label을 붙인다. PR 미리보기 namespace도 같은 Namespace 리소스에서 만들어져 label을 물려받는다.

## 이유

- 처음 구성(KFP standalone)에서는 `seaweedfs` 정책 하나만 8333 포트를 막아서, 그 정책을 지우면 해결됐다.
- Kubeflow 배포판은 `kubeflow` namespace에 `default-allow-same-namespace` 정책을 걸고 서비스마다 허용 정책을 둔다. `seaweedfs` 정책을 지우면 기본 정책만 남아 오히려 다른 namespace의 접근이 모두 막힌다.
- 노트북은 profile namespace라서 배포판 정책을 그대로 통과한다. 허용이 더 필요한 곳은 MLflow뿐이다.
- k3s의 `--disable-network-policy`는 호스트 재설치가 필요하고, 배포판이 전제하는 격리도 함께 사라져서 고르지 않았다.
