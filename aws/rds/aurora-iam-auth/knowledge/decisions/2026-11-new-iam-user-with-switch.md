---
type: Decision
title: password에서 IAM 인증으로의 전환은 새 IAM 사용자와 설정 스위치로 한다
description: 기존 사용자를 ALTER USER로 바꾸지 않고 app_iam을 새로 만들어 SSM 스위치로 전환한다
tags: [aurora, mysql, iam, migration]
timestamp: 2026-11-07T00:00:00Z
---

## 결정

- 무중단 전환은 IAM 사용자(`app_iam`)를 새로 만들어 기존 `app_pw`와 공존시키고, 앱은 SSM `/aurora-iam-lab/db-auth-mode` 값(5초 캐시)으로 새 연결의 사용자를 고른다.
- 옛 사용자는 `ACCOUNT LOCK`으로 먼저 막고, audit 로그에 `FAILED_CONNECT 3118`이 없을 때 `DROP USER`한다.
- 앱은 요청마다 새 연결을 맺는다. 커넥션 풀은 쓰지 않는다.

## 이유

- Aurora MySQL은 사용자 하나에 인증 플러그인 하나라서, `ALTER USER`로 바꾸면 그 순간 새 password 로그인이 전부 `1045`로 실패했다(실측, 유예 없음). 새 사용자를 만들면 두 방식이 공존한다.
- 스위치를 두면 롤백이 배포가 아니라 설정 변경이라 수 초에 끝났다. 전환, 롤백, 재전환 모두 prober 오류 0이었다.
- 요청마다 연결해야 스위치가 즉시 반영되고, 전환 중 실패한 로그인이 prober 오류로 바로 드러난다. 풀을 쓰면 기존 연결이 옛 사용자로 남아 측정이 흐려진다. 풀 환경의 주의사항은 docs/4의 부록에 있다.

관련: [EC2 application status check를 awscc로 만든 이유](2026-11-app-status-check-awscc.md)
