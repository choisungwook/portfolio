---
type: Decision
title: GitOps 저장소를 새로 만들지 않고 이 저장소의 workspace를 Argo CD가 읽는다
description: 플래닝의 별도 저장소(mlops-part2-handson, main)를 portfolio 저장소 master와 manifests/argocd로 바꿨다
tags: [argocd, gitops, plan-change]
timestamp: 2026-10-25T00:00:00Z
---

## 결정

- Argo CD repoURL은 이 저장소, targetRevision은 `master`, 경로는 `mlops/ml-platform-engineering-part2/manifests/...`.
- 플래닝의 `argocd/` 최상위 디렉터리는 `manifests/argocd/`로 옮겼다. 사람이 적용하는 파일은 ApplicationSet 2개다.
- PR 미리보기 generator도 이 저장소의 PR을 본다. `preview` label로 다른 PR을 거른다.

## 이유

- 핸즈온 코드는 workspace 옆에 둔다는 저장소 규칙과, 모든 Kubernetes 매니페스트는 `manifests/` 아래에 둔다는 규칙을 따랐다.
- 공개 저장소라 Argo CD는 자격 증명 없이 pull한다. PR generator도 토큰 없이 GitHub API를 부르고, 익명 한도(IP당 시간당 60회) 안에 들도록 폴링을 180초로 둔다.
- 감수: 저장소가 커서 repo-server clone이 느릴 수 있다. 느리면 별도 저장소로 분리한다.
