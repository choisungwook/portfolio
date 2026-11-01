---
type: Decision
title: Argo CD Application은 app-of-apps 없이 ApplicationSet으로만 만든다
description: 구성요소 Application이 경로와 namespace만 달라 list generator 템플릿 하나로 묶었다
tags: [argocd, applicationset, gitops]
timestamp: 2026-10-31T00:00:00Z
---

## 결정

- `platform-applicationset.yaml`(list generator)이 구성요소 6개의 Application을, `mlflow-preview-applicationset.yaml`(pullRequest generator)이 PR 미리보기를 만든다.
- root Application(app-of-apps)과 Application 파일 6개는 지웠다. sync-wave도 쓰지 않는다.

## 이유

- 구성요소 Application은 `path`와 `destination.namespace`만 다르고 `syncPolicy`가 같다. 템플릿 하나와 `elements` 한 줄이 Application 파일 6개보다 고치기 쉽다.
- sync-wave는 root가 하위 Application을 만드는 순서만 정했고, Argo CD는 Application이 Healthy가 될 때까지 기다리지 않아 효과가 거의 없었다. 순서는 Application의 `retry`가 맞춘다.
- 감수: ApplicationSet 자체는 Argo CD가 관리하지 않는다. ApplicationSet 파일을 바꾸면 `scripts/up.sh`로 다시 적용한다.
- 운영 중 전환할 때 root Application을 그대로 지우면 finalizer가 하위 리소스를 모두 지운다. finalizer를 먼저 떼고 지운 뒤 ApplicationSet을 적용하면, ApplicationSet이 같은 이름의 Application을 이어받는다(ownerReference 확인).
