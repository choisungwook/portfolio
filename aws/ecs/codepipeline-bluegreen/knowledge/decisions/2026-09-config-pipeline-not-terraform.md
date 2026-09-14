---
type: Decision
title: 환경변수 변경도 terraform이 아니라 config 파이프라인으로 배포한다
description: task definition의 environment만 바꾸는 배포를 S3 source의 CodePipeline으로 두고, terraform은 초기 revision만 만든다
tags: [ecs, codepipeline, terraform]
timestamp: 2026-09-14T00:00:00Z
---

## 결정

task definition의 environment 변경은 S3에 env.json(zip)을 올려 시작되는 config 파이프라인이 한다. terraform은 서비스와 초기 task definition revision만 만들고, 이후 revision은 파이프라인이 CLI로 등록한다.

## 이유

- 이 핸즈온의 목표가 "배포 이력을 CodePipeline 한 곳에서 본다"이다. 이미지는 파이프라인, 설정은 terraform으로 나누면 이력이 두 곳으로 갈라진다.
- terraform이 task definition을 계속 관리하면 파이프라인이 등록한 revision(이미지 tag)을 다음 apply가 되돌린다. 둘 중 하나만 주인이어야 하고, 이력이 필요한 쪽은 파이프라인이다.
- 대가로 terraform은 서비스의 task_definition을 ignore_changes로 둔다. 서비스 리소스 스펙(cpu, memory, 포트)을 바꾸려면 파이프라인이 복제하는 현재 revision에는 반영되지 않으므로, 초기 revision을 바꾼 뒤 파이프라인을 한 번 태워야 한다. 관련: [terraform은 ECS가 바꾸는 상태를 무시한다](2026-09-terraform-ignores-ecs-managed-state.md)
