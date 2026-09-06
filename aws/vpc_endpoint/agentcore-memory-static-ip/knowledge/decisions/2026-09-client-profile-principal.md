---
type: Decision
title: 클라이언트는 로컬 AWS 프로파일로 시작하고 Terraform은 키를 만들지 않는다
description: 시작 주체는 trusted_principal_arn으로 받고, IAM 사용자·액세스 키 생성과 비밀 output을 제거한다.
tags: [aws, terraform, iam, sts, credentials]
timestamp: 2026-09-06T17:00:00Z
---

## 결정

- S01·S07의 client Role trust는 `trusted_principal_arn`의 기존 IAM 사용자·Role을 참조.
- S01 STS endpoint policy는 PoC 동안 전체 허용(Principal *, Action *). 실무용 제한 정책은 Terraform 주석에 예시 계정 123456789012로 남김. Memory endpoint policy와 Role의 aws:SourceVpce 조건은 유지.
- Terraform은 IAM 사용자·액세스 키·사용자 정책을 만들지 않고, `client_credentials` 같은 비밀 output을 두지 않음.
- 클라이언트 코드는 `AWS_PROFILE`의 프로파일로만 시작. 환경변수 키가 있으면 중단.
- 로컬 기본값은 admin 프로파일(Role administrator). Role → Role chaining이라 세션은 최대 1시간.
- 이 결정은 2026-09-06 이전의 "S01 시작 IAM 사용자를 Terraform으로 생성" 결정을 대체함. 그 파일은 삭제.

## 이유

- 사용자 원칙: 비밀은 Terraform output·state로 내보내지 않고 로컬 AWS 프로파일로만 다룬다.
- 이전 결정의 계기였던 Invalid principal 오류는 예제 ARN을 그대로 입력한 것이 원인이었고 설계 결함이 아니었음. 변수 validation과 세션 ARN 거부 테스트로 같은 실수를 막음.
- 프로파일 방식은 Terraform 관리 인증과 같은 로그인 갱신 경로를 쓰므로 키 만료·복사 절차가 사라짐.
- 관리 주체와 실험 주체가 같아지는 대가가 있음. 분리가 필요하면 별도 IAM Role 프로파일을 만들고 그 ARN을 넣는다.
- STS endpoint policy를 trust 주체로 좁히면 hosts를 바꾼 컴퓨터에서 admin 프로파일의 체인 AssumeRole(user → administrator)과 Terraform의 GetCallerIdentity까지 같은 endpoint를 지나 거부됨. 2026-09-06 실제 재현. 좁히려면 체인 없는 시작 주체(base 프로파일)와 관리 명령 시 hosts 제거가 함께 필요.

## Citations

1. [S01 프로파일 준비](../../docs/2-setup.md#클라이언트-프로파일과-시작-주체)
2. [Terraform 관리 인증 분리](2026-09-terraform-management-role.md)
