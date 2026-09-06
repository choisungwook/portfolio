---
type: Decision
title: 실습 CRL의 관리와 정리 범위
description: 기본 AWS provider가 제공하지 않는 CRL을 명시적인 관리 스크립트로 다룬다.
tags: [terraform, roles-anywhere, crl]
timestamp: 2026-09-05T00:00:00Z
---

## 결정

- Terraform AWS provider 6.63.0으로 trust anchor·profile·IAM·Memory 관리.
- CRL은 별도 boto3 import/update/delete 스크립트로 관리.
- CRL 조회 시 정확한 trust anchor ARN과 실습 CRL 이름을 함께 검사.
- 정리 시 CRL을 먼저 삭제하고 Terraform 리소스를 삭제.
- runtime 설정·공개 CA 파일·CA 발급 DB는 AWS 정리 완료까지 유지.

## 이유

- 확인한 AWS provider schema에는 rolesanywhere_profile과 rolesanywhere_trust_anchor만 존재.
- CRL 하나를 위해 추가 provider나 Terraform provisioner를 도입할 필요가 없음.
- 이름만으로 CRL을 선택하면 다른 trust anchor의 실험과 충돌할 수 있음.
- 로컬 CRL ID 저장 실패가 생겨도 AWS에서 소유 범위로 다시 조회할 수 있어야 함.

## Citations

1. [CRL 관리 API와 Terraform 근거](../references/roles-anywhere-lifecycle.md)
