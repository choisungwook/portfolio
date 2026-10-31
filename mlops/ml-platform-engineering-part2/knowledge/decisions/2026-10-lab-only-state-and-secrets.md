---
type: Decision
title: Redis는 PVC 없이, PostgreSQL 비밀번호는 Git에 실습 값으로 둔다
description: 단일 노드 실습에서 미리보기 namespace가 Secret 없이 뜨지 못하는 문제를 피한다
tags: [mlflow, redis, secrets]
timestamp: 2026-10-25T00:00:00Z
---

## 결정

- Redis는 PVC와 비밀번호 없이 띄운다. 책의 Bitnami secret 조회 코드는 쓰지 않는다.
- MLflow PostgreSQL Secret은 `mlflow-lab-only` 값으로 Git에 둔다. HF 토큰은 Git에 두지 않고 Ubuntu에서 만든다. GitHub 토큰은 쓰지 않는다.

## 이유

- Redis 값은 `feast materialize`로 언제든 다시 채울 수 있다.
- PR 미리보기 namespace는 PR마다 새로 생겨서, 사람이 미리 Secret을 만들 수 없다. 클러스터 밖으로 노출하지 않는 단일 노드 k3s라는 전제에서만 유효하다.
