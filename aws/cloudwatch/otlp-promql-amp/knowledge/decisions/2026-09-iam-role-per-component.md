---
type: Decision
title: 컨테이너에 로컬 자격 증명을 넣지 않고 컴포넌트마다 IAM role을 둔다
description: 로컬 AWS profile은 terraform apply와 사람의 CLI 조회에만 쓰고, 수집기·Grafana·AMG는 각자 role로 서명한다.
tags: [aws, iam, amp, cloudwatch, grafana]
timestamp: 2026-09-23T00:00:00Z
---

# 컨테이너에 로컬 자격 증명을 넣지 않고 컴포넌트마다 IAM role을 둔다

## 결정

- provider에 profile을 적지 않는다. `export AWS_PROFILE`을 가정한다
- 수집기 task role은 쓰기(`cloudwatch:PutMetricData`, `aps:RemoteWrite`)만, ECS Grafana task role과 AMG workspace role은 조회만 갖는다
- 로컬 compose는 AWS로 보내지 않는다. exporter를 `debug`로 바꾸고, `sigv4auth` 기동 검증만 가짜 키로 통과시킨다
- 조회 Grafana는 `grafana` 변수(`ecs` 기본, `amg`, `none`)로 하나만 만든다
- AMG datasource는 terraform이 아니라 `scripts/amg-setup.sh`가 1시간 token으로 넣고 service account째 지운다

## 이유

- 처음에는 로컬 compose에서 `~/.aws`를 mount해 수집기와 Grafana를 돌렸다. 저장·조회는 AWS였지만 운영과 달리 개인 자격 증명이 컨테이너에 들어가고 IAM 권한 경계를 검증하지 못했다
- terraform grafana provider나 `aws_grafana_workspace_service_account_token`으로 datasource를 만들면 token이 state에 남는다
- AMG는 service account도 API 사용자로 과금한다(Admin 월 9 USD). 스크립트를 같은 달에 여러 번 돌리면 license가 더 붙을 수 있다

## Citations

1. [Amazon Managed Grafana FAQs](https://aws.amazon.com/grafana/faqs/)
2. [terraform/iam.tf](../../terraform/iam.tf), [terraform/grafana.tf](../../terraform/grafana.tf), [terraform/amg.tf](../../terraform/amg.tf)
