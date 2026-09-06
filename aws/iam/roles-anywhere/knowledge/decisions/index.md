# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [Roles Anywhere 실습을 30분 컨셉 범위로 축소](2026-09-thirty-minute-concept-scope.md) - 문서 3개·코드 4개, 실제 AWS 흐름 한 바퀴, 실행에서 확인한 사실.
* [인증서 수명과 AWS 세션 수명 분리](2026-09-certificate-lifecycle-boundaries.md) - 인증서 client와 Terraform·CRL 관리 인증 A·B, 세션 갱신의 구분.
* [실습 CRL 관리와 정리 범위](2026-09-crl-management-ownership.md) - CRL의 API 관리와 안전한 리소스 선택.
* [고정 IP 경로의 Roles Anywhere 시나리오는 나중에 S01 확장으로](2026-09-fixed-ip-scenario-deferred.md) - 네트워크 workspace의 RA 시나리오 삭제와 심화학습 위치.
