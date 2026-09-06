---
type: Reference
title: Roles Anywhere 인증서 수명과 운영의 공식 근거
description: 자격증명 갱신·CRL·감사와 관리 범위의 근거를 짧게 보관한다.
timestamp: 2026-09-05T00:00:00Z
---

## 확인 사항

- CreateSession은 인증서 기반 서명으로 IAM Role의 임시 자격증명을 발급.
- Role trust는 서비스 principal과 AssumeRole·TagSession·SetSourceIdentity를 허용하고 인증서 속성으로 제한 가능.
- 최종 세션 기간은 profile과 요청값의 작은 값. Role 최대 기간을 넘으면 오류.
- SDK는 credential_process의 Expiration을 이용해 helper를 다시 실행할 수 있음.
- CRL은 import/update 필요. CDP·OCSP 자동 호출 미지원.
- IAM 세션 권한 회수는 지정 시각 이전의 Role 세션에 Deny 정책을 적용.
- CloudWatch DaysToExpiry는 trust anchor 대상. Leaf 만료 감시는 별도 필요.
- AWS provider 6.63.0 schema의 Roles Anywhere 리소스는 profile과 trust_anchor. CRL은 AWS API로 관리.

## Citations

1. [CreateSession](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/authentication-create-session.html)
2. [Trust model·CRL](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/trust-model.html)
3. [Credential helper](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/credential-helper.html)
4. [IAM 세션 권한 회수](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html)
5. [CloudWatch](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/monitoring-cloudwatch.html)
6. [ImportCrl API](https://docs.aws.amazon.com/rolesanywhere/latest/APIReference/API_ImportCrl.html)
7. [Terraform AWS provider](https://registry.terraform.io/providers/hashicorp/aws/6.63.0/docs)
