---
type: Decision
title: PR 미리보기 Application이 namespace 리소스를 직접 소유한다
description: CreateNamespace로 만든 namespace는 Application 삭제 후 남으므로 kustomize namespace 덮어쓰기로 소유권을 준다
tags: [argocd, applicationset, preview]
timestamp: 2026-10-25T00:00:00Z
---

## 결정

- `manifests/mlflow`에 Namespace 리소스를 두고 kustomization의 `namespace: mlflow`로 이름을 정한다.
- 미리보기 Application은 `spec.source.kustomize.namespace: preview-<번호>`로 덮어쓰고 `resources-finalizer.argocd.argoproj.io`를 단다.

## 이유

- Argo CD의 `CreateNamespace=true`는 Application을 지워도 namespace를 남긴다. 플래닝의 "merge 후 namespace가 사라진다"를 만족하지 못한다.
- kustomize namespace 변환은 Namespace 리소스 이름도 바꾼다. namespace를 `preview-12`로 바꿔 렌더링해 Namespace 이름이 `preview-12`가 되는 것을 확인했다.
