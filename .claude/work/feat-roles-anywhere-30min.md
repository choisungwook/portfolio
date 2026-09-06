# IAM Roles Anywhere 30분 컨셉 핸즈온으로 재구성

- Issue: 미생성
- Branch: feat/roles-anywhere-30min

## 실행 계획

- [x] 1. 기존 workspace·knowledge 전체 읽고 판단 (문서 10개·스크립트 16개·실험 5개, 실제 AWS 미검증)
- [x] 2. 코드 통합: pki.py(CA·발급·폐기·CRL), run.py(helper→boto3→Memory), crl.py(AWS import/update/delete), install_helper.py. client/ 패키지·-v1 문서 삭제
- [x] 3. 문서 재작성: README(30분 순서), docs/1-concept.md(원리·구성요소·운영·revoke·네트워크·OIDC 비교), docs/2-handson.md, docs/3-validation.md
- [x] 4. 실제 AWS 검증: apply → 정상 PASS → CN 거부 → v2 교체 → v1 CRL 폐기 → destroy
- [x] 5. knowledge 갱신(30분 축소 결정), 루트 README 목차, 검증·링크·테스트

## 다음 세션이 알아야 할 것

- AWS_PROFILE=admin 사용. helper 1.8.5 arm64가 runtime/bin에 이미 있음
- 75분 갱신 관찰(watch.py)은 컨셉 범위에서 제외, 운영 문서에 원리만 남김
