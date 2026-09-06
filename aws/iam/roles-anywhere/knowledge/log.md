# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-09-06

* **Creation**: [고정 IP 경로의 Roles Anywhere 시나리오 미룸](decisions/2026-09-fixed-ip-scenario-deferred.md) - 네트워크 workspace의 S04·S06·S08 삭제와 인터넷+public NLB+RA의 향후 위치.

* **Update**: [인증서·세션 수명 분리](decisions/2026-09-certificate-lifecycle-boundaries.md) - CRL 관리 명령이 Terraform과 같은 A·B 인증을 사용하도록 프로파일 강제 제거.

* **Update**: [인증서·세션 수명 분리](decisions/2026-09-certificate-lifecycle-boundaries.md) - provider 인증 설정 제거, Terraform과 CRL 관리 명령의 admin 프로파일 통일.

* **Update**: [인증서·세션 수명 분리](decisions/2026-09-certificate-lifecycle-boundaries.md) - Terraform의 배포 Role과 CRL용 Role 프로파일, 인증서 client Role을 구분.

* **Update**: [인증서·세션 수명 분리](decisions/2026-09-certificate-lifecycle-boundaries.md) - uv 가상환경과 직접 명령으로 실행하고 관리·클라이언트 provider 구분 유지.

## 2026-09-05

* **Creation**: [인증서·세션 수명 분리](decisions/2026-09-certificate-lifecycle-boundaries.md) - 갱신·폐기와 네트워크 조건을 독립 관찰하는 이유.
* **Creation**: [CRL 관리 범위](decisions/2026-09-crl-management-ownership.md) - API 관리와 정확한 trust anchor 기준 정리.
* **Creation**: [공식 인증·운영 근거](references/roles-anywhere-lifecycle.md) - 세션·CRL·모니터링 지원 조건.
