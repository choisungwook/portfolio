---
type: Decision
title: task definition 변경 미리 보기는 PR comment로
description: Pipeline 승인 단계 대신 GitHub Actions가 운영 상태와 Git JSON의 diff를 PR에 남김
tags: [ecs, github-actions, oidc]
timestamp: 2026-10-05T00:00:00Z
---

# task definition 변경 미리 보기는 PR comment로

## 결정

- pull_request(JSON 변경)와 issue_comment(`/ecs-diff`)에서 diff를 PR comment로 남김. 같은 comment를 갱신.
- AWS는 GitHub OIDC로 DescribeServices·DescribeTaskDefinition만 허용한 role 사용.
- role trust의 sub는 `pull_request`와 기본 branch ref만 허용.
- issue_comment는 owner·member·collaborator만, 스크립트는 기본 branch 것을 쓰고 PR에서는 JSON만 가져옴.
- fork PR은 실행하지 않음.
- 2026-10-05 동작 검증 후 워크플로는 `github-workflow/`로 옮겨 보관. `.github/workflows/` 안의 전체 주석 파일은 invalid workflow로 push마다 실패 run 생성.

## 이유

- Git이 관리하는 것은 설정 JSON뿐이라 리뷰 시점인 PR이 diff를 보기 가장 좋은 곳.
- CodePipeline Manual approval은 diff를 직접 보여 주지 못하고 배포마다 대기가 생김.
- public 저장소라 누구나 comment 가능. 권한 확인 없이 PR 코드를 AWS 자격 증명과 함께 실행하면 안 됨.
- issue_comment는 기본 branch의 workflow로만 실행되므로 merge 전에는 comment 경로 검증 불가.
- 운영 task definition에 평문 비밀 환경변수가 있으면 public comment로 노출. 비밀은 secrets(valueFrom)로만 넣음.
