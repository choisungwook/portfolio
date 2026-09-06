---
type: Decision
title: Terraform 관리 인증과 실험 인증 분리
description: Terraform 관리 인증은 프로세스 자격증명 또는 STS 임시 키로 선택하고 실험 클라이언트 인증은 분리한다.
tags: [aws, terraform, sts, credentials]
timestamp: 2026-09-06T00:00:00Z
---

## 결정

- 모든 Terraform root에서 provider의 assume_role 블록과 배포 Role 입력 변수 제거.
- A는 default의 login_session → base의 CLI export-credentials → admin의 AssumeRole 연결. AWS_PROFILE=admin으로 관리 명령 실행.
- B는 default 로그인 후 STS AssumeRole 응답을 환경변수에 복사. Role 만료 시 재발급하고 Terraform 재실행.
- Terraform·CLI·관리 Python은 선택한 A·B 인증 공유. 관리 명령에 admin 프로파일을 강제하지 않음.
- 클라이언트는 별도 셸에서 AWS_PROFILE로 시작. 배포용 Role과 클라이언트가 받는 client Role을 구분.
- 시나리오 입력은 TF_VAR 환경변수로 전달. 기존 tfvars의 우선순위와 독립 state 유지.

## 이유

- 실습 코드에서 배포용 인증 설정을 제거하고 AWS 프로파일 선택만으로 실행 절차 통일.
- A는 CLI가 로그인 갱신을 담당해 SDK의 login_session 직접 지원에 의존하지 않음.
- B는 구성 요소가 적지만 임시 키를 복사한 뒤 자동 갱신 경로가 없어 짧은 실행에 적합.
- AWS login을 원본으로 사용하면 새 Role을 받아도 원본 login 세션의 만료 제약은 남음.
- 로그인 세션의 최대 12시간과 Role 키의 Expiration은 별개. 원본 로그인 종료 후 새 Role 발급에는 재로그인 필요.
- B에서 실행 중인 Terraform은 부모 셸의 키 변경을 받지 못하므로 새 키 적재만으로 진행 중 apply의 갱신 문제를 해결할 수 없음.
- 원격 backend를 추가하면 해당 인증 설정도 확인.
- 같은 셸에서 클라이언트 프로파일을 바꾸면 후속 Terraform 관리 명령의 원본 주체가 달라질 수 있음.

## Citations

1. [Terraform 관리 인증 준비](../../docs/7-terraform-setup.md)
