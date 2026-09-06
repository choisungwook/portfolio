---
type: Decision
title: Roles Anywhere 실습을 30분 컨셉 범위로 축소
description: 원리·구성 요소·운영·폐기·네트워크 다섯 주제와 실제 AWS 흐름 한 바퀴만 남기고, 코드는 자기완결 파일 4개로 통합한다.
tags: [aws, roles-anywhere, scope, pki]
timestamp: 2026-09-06T22:40:00Z
---

## 결정

- 문서는 개념(1-concept), 핸즈온(2-handson), 검증(3-validation) 세 개. -v1 중복본과 운영 전용 문서는 삭제하고 운영 내용은 개념 문서의 표로 압축.
- 코드는 루트의 pki.py(CA·발급·폐기·CRL), run.py(helper → boto3 → Memory), crl_aws.py(CRL import/update/delete), install_helper.py. client/·scripts/ 패키지와 watch.py(75분 갱신 관찰)는 삭제.
- 실습 흐름은 init → apply → 인증 PASS → CN 거부 → v2 교체 → v1 폐기·CRL → destroy. 자동 갱신·세션 회수·PrivateLink는 "더 해 보기"로만 남김.
- 2026-09-06 실제 AWS에서 위 흐름 전체를 실행해 문서의 출력을 실측값으로 교체.

## 이유

- 사용자 목적은 "IAM 자격증명이 아예 없는 워크로드"의 인증 방식을 30분 안에 이해하고 실물로 보는 것. 이전 구성(문서 10개·스크립트 16개·실험 5개)은 한 번도 실제 AWS에서 돌지 않은 채 분량만 컸음.
- OIDC 대안은 STS가 IdP의 discovery·JWKS를 인터넷으로 호출해야 하고 AWS의 outbound 소스 IP가 공개되지 않아 폐쇄망 IdP에서 성립하지 않음. 이 비교가 "왜 Roles Anywhere인가"의 핵심이라 개념 문서 첫 부분에 둠.
- 자기완결 파일 방침은 네트워크 workspace와 같음. 예제를 읽는 사람이 한 파일에서 흐름을 끝까지 볼 수 있어야 함.

## 실행에서 확인한 사실

- apply 직후 첫 CreateEvent는 IAM 정책 전파 지연으로 AccessDenied. 수 초 뒤 재시도 통과. Roles Anywhere 인증 자체는 첫 시도부터 성공.
- 같은 CA·다른 CN은 CreateSession 403 "Unable to assume role" — Role trust의 PrincipalTag 조건이 막음.
- CRL import 직후 첫 시도부터 "Certificate revoked". 전파 대기 없음.
- 세션 이름은 인증서 serial(1000, 1002). 교체 뒤 값이 바뀌므로 serial 기준 추적표가 필요.

## Citations

1. [인증서 수명과 AWS 세션 수명 분리](2026-09-certificate-lifecycle-boundaries.md)
2. [실습 CRL 관리와 정리 범위](2026-09-crl-management-ownership.md)
