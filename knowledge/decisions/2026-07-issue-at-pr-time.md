---
type: Decision
title: 기록용 Issue는 PR 생성 시점에 작성
description: GitHub Issue를 작업 시작 전이 아니라 PR을 만들 때 기록용으로 함께 작성한다.
tags: [workflow, github]
timestamp: 2026-07-10T00:00:00Z
---

## 결정

작업 시작 전에 Issue를 만들거나 작업 중간에 Issue comment를 남기지 않는다. PR을 만들 때 Goal과 ADR을 담은 기록용 Issue를 함께 만들고 PR body에서 링크한다.

## 이유

- 작업 전에 만든 Issue는 계획이고, 실제 작업 결과와 어긋나는 경우가 많았다. 작업이 끝난 시점에 기록하면 실제로 내린 결정만 남는다.
- 작업 중간 comment는 agent의 진행 로그일 뿐 나중에 다시 읽을 가치가 없었다. 최종 ADR만 남기는 편이 검색과 회고에 유리하다.

관련 절차는 [새 핸즈온 추가 절차](../playbooks/add-new-hands-on.md)를 참조한다.
