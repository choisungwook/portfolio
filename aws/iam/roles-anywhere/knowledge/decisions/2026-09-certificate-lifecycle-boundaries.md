---
type: Decision
title: 인증서 수명과 AWS 세션 수명을 분리
description: 인증·권한·네트워크를 각각 관찰하도록 독립 기본 실습을 구성한다.
tags: [aws, roles-anywhere, pki, credentials]
timestamp: 2026-09-05T00:00:00Z
---

## 결정

- 기본 실습은 public Roles Anywhere와 Memory로 구성하고 NLB·VPN 조건은 네트워크 workspace에 유지.
- 정상·다른 CN·교체용 인증서를 같은 CA에서 발급해 체인 신뢰와 Role trust 조건을 독립 관찰.
- 개인 키와 serial을 새로 만들고 동일한 CN을 유지해 신원 유지와 키 교체를 구분.
- SDK의 credential_process provider를 유지하고 실제 임시 키를 복사하지 않음.
- CRL 반영 후에는 새 프로세스의 CreateSession을 확인. 기존 세션 권한 회수와 구분.
- 발급 DB·CA 키는 관리 환경에 두고 클라이언트 프로세스는 Leaf 자료만 사용.
- uv 가상환경의 Python과 Terraform 명령으로 로컬 실행. 코드는 루트의 자기완결 파일 4개([30분 축소 결정](2026-09-thirty-minute-concept-scope.md)).
- Terraform과 CRL 스크립트는 관리 인증(AWS_PROFILE=admin) 공유. 클라이언트 run.py는 인증서만 사용.
- 배포 Role과 인증서가 받는 클라이언트 Role은 독립. [관리 인증 분리의 이유](../../../../vpc_endpoint/agentcore-memory-static-ip/knowledge/decisions/2026-09-terraform-management-role.md) 공유.

## 이유

- NLB·DNS 제약을 동시에 넣으면 인증서 거부 원인을 분리하기 어려움.
- 같은 CA의 인증서도 허용된 workload 속성에 맞지 않으면 Role을 받지 않아야 함.
- CRL은 새로운 인증에 적용되므로 이미 발급된 세션까지 회수됐다고 판정하면 안 됨.
- SDK가 만료 시 helper를 다시 실행할 수 있어야 장시간 애플리케이션 동작을 검증할 수 있음.
- 로컬 실습에서도 관리 자격증명과 인증서 기반 client provider의 선택을 분리해 관찰할 수 있음.
- 관리 명령에 프로파일을 강제하지 않아 A·B 중 선택한 인증을 Terraform과 CRL 스크립트에서 함께 사용 가능.

## Citations

1. [공식 인증·운영 근거](../references/roles-anywhere-lifecycle.md)
