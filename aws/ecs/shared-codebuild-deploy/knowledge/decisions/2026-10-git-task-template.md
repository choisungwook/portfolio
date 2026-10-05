---
type: Decision
title: Terraform으로 최초 생성, 추출한 JSON을 Git에서 관리
description: 이미지 태그를 뺀 ECS 설정은 Git JSON, 태그는 필수 실행 입력
tags: [ecs, codebuild, terraform, gitops]
timestamp: 2026-10-05T00:00:00Z
---

# Terraform으로 최초 생성, 추출한 JSON을 Git에서 관리

## 결정

- 최초 task definition은 Terraform HCL로 생성. `ignore_changes = all`.
- `export-taskdef.sh`로 service가 쓰는 정의를 추출해 Git JSON으로 관리. image는 `__IMAGE__`.
- 배포 입력 `IMAGE_TAG`는 필수. 비우거나 운영 이미지를 유지하는 모드(KEEP_CURRENT) 없음.
- 설정만 바꿀 때도 운영 중 태그를 ECS의 `app_version` 등록 태그에서 조회해 입력.

## 이유

- 이전 구현은 Git JSON을 Terraform이 읽는 방향이라 다른 계정에서 재현 불가. JSON에 계정 ID가 들어 있음.
- 블로그 설계가 Terraform → 추출 순서. 핸즈온은 설계를 그대로 보여 주는 예제.
- KEEP_CURRENT는 편하지만 설계에 없는 입력 모드. 스크립트 분기와 IAM 권한(DescribeTaskDefinition)이 늘어남.
