---
type: Decision
title: latest tag push로 파이프라인을 깨우고 배포에는 버전 tag를 쓴다
description: ECR source action의 ImageTag는 고정값이라 latest로 트리거하고, CodeBuild가 imageDetail.json의 ImageTags에서 버전 tag를 골라 task definition에 넣는다
tags: [ecs, codepipeline, ecr]
timestamp: 2026-09-14T00:00:00Z
---

## 결정

make push는 버전 tag(v1, v2)와 latest를 같은 이미지에 함께 push한다. EventBridge rule은 image-tag가 latest인 push 이벤트만 잡아 image 파이프라인을 시작한다. CodeBuild는 imageDetail.json의 ImageTags 중 latest가 아닌 것을 골라 image로 쓰고, 없으면 ImageURI(digest 형식)를 그대로 쓴다.

## 이유

- CodePipeline ECR source action은 ImageTag를 설정에 고정해야 한다. v2, v3처럼 매번 바뀌는 tag로는 source를 만들 수 없다.
- task definition에 latest를 박으면 revision을 봐도 어떤 이미지였는지 알 수 없다. 이력이 목적이므로 revision에는 사람이 읽는 버전 tag가 남아야 한다.
- imageDetail.json의 ImageURI는 digest 형식이라 정확하지만 읽기 어렵다. tag가 없을 때의 fallback으로만 쓴다.
- ECR 이벤트는 tag마다 하나씩 발생하므로 두 tag를 함께 push해도 파이프라인은 한 번만 시작된다.
