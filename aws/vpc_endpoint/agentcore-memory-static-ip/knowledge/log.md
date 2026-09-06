# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-09-06

* **Update**: [클라이언트는 로컬 AWS 프로파일로 시작](decisions/2026-09-client-profile-principal.md), [public NLB 진입과 AWS 권한 분리](decisions/2026-09-public-nlb-ingress.md) - PR 리뷰 반영. STS endpoint policy Action을 sts:*로, S07 프록시 SG egress를 endpoint SG 참조로 좁힘.

* **Update**: [PoC 범위 축소](decisions/2026-09-poc-scope-s01-s05-s07.md) - S02 번호 재사용(앱 네트워크 Squid) 명시. README를 재실행 순서 인덱스로 재작성.

* **Update**: [AWS 안의 CONNECT proxy는 권장 구성이 아니다](decisions/2026-09-no-connect-proxy-in-aws.md) - 대안 S02(앱 네트워크 Squid) 구현·PASS, 전역 HTTPS_PROXY가 자격증명 체인을 막는 함정 기록.

* **Creation**: [AWS 안의 CONNECT proxy는 권장 구성이 아니다](decisions/2026-09-no-connect-proxy-in-aws.md) - S07 PASS 후 사용자 판단. IAM이 있는데 프록시 인증 홉을 추가할 이유가 없고, 프록시는 클라이언트 네트워크 쪽 문제.

* **Update**: 검증 상태 - S01·S05·S07 세 시나리오 모두 실제 AWS에서 확인. S01 destroy 후 S07 배포. (docs/4-validation.md)

* **Update**: [실습 hosted zone의 등록기관 NS 권한](topics/demo-akbun-com-delegation.md) - Cloudflare에 demo NS 추가로 해결, S05 실제 재현, ACM *.demo.akbun.com 재요청.

* **Update**: [실습 hosted zone의 등록기관 NS 권한](topics/demo-akbun-com-delegation.md) - 위임 대신 권한 DNS에 A 레코드 직접 추가, Terraform Route 53 레코드 선택 사항화.

* **Update**: [실습 hosted zone의 등록기관 NS 권한](topics/demo-akbun-com-delegation.md) - 위임 레코드는 Route 53 akbun.com zone에 있으나 등록기관 NS가 Cloudflare라는 진단으로 수정. zone ID·도메인을 tfvars로 이동.

* **Update**: [클라이언트는 로컬 AWS 프로파일로 시작](decisions/2026-09-client-profile-principal.md) - STS endpoint policy 전체 허용과 좁혔을 때 관리 경로가 막히는 재현 기록.
* **Update**: [public NLB 진입과 AWS 권한 분리](decisions/2026-09-public-nlb-ingress.md) - STS endpoint 정책 항목을 PoC 전체 허용으로 교체.

* **Creation**: [클라이언트는 로컬 AWS 프로파일로 시작](decisions/2026-09-client-profile-principal.md) - 비밀 output 금지 원칙, trusted_principal_arn 복귀.
* **Deletion**: S01 시작 IAM 사용자를 Terraform으로 생성 - 위 결정으로 대체. 키를 state·output에 두는 방식 폐기.
* **Update**: [public NLB 진입과 AWS 권한 분리](decisions/2026-09-public-nlb-ingress.md), [Terraform 관리 인증과 실험 인증 분리](decisions/2026-09-terraform-management-role.md) - 생성 사용자 언급을 프로파일 주체로 교체.

* **Creation**: [demo.akbun.com NS 위임 선행 조건](topics/demo-akbun-com-delegation.md) - Route 53 레코드 생성과 인터넷 조회 가능은 별개, ACM FAILED의 원인.
* **Update**: [AWS API 연결 실습의 위치](decisions/2026-09-network-lab-location.md) - 이 workspace는 STS 전용, Roles Anywhere 비교 문구 제거.

* **Creation**: [PoC 범위를 S01·S05·S07로 축소](decisions/2026-09-poc-scope-s01-s05-s07.md) - 인터넷 고정 EIP 목적과 1시간 제약, Route 53 테스트 형태의 판단.
* **Update**: [DNS 변경 불가와 인증 방식 분리](decisions/2026-09-separate-auth-from-routing.md) - VPCE 직접·Roles Anywhere 항목 제거, S05·S07 관계로 축소.
* **Update**: [AWS 호스트명과 TLS 유지](decisions/2026-09-preserve-aws-hostname.md), [public NLB 진입과 AWS 권한 분리](decisions/2026-09-public-nlb-ingress.md), S01 시작 IAM 사용자 (삭제됨) - 삭제한 S02·S03·S08 언급 제거.
* **Deletion**: Roles Anywhere 경로 근거 reference - 인증 부분은 독립 실습 workspace로, proxy 근거는 decision Citations로 이동.

* **Update**: [Terraform 관리 인증과 실험 인증 분리](decisions/2026-09-terraform-management-role.md) - A의 default → base → admin 갱신과 B의 STS 임시 키 복사로 선택지 분리. S01 배포 인증 설명도 A·B 기준으로 갱신.

* **Update**: [Terraform 관리 인증과 실험 인증 분리](decisions/2026-09-terraform-management-role.md) - provider AssumeRole·배포 Role 변수 제거, login-base 로그인 후 AWS_PROFILE=admin 사용으로 변경.
* **Update**: S01 시작 IAM 사용자 (삭제됨) - 배포용 admin 프로파일과 생성된 클라이언트 IAM 리소스 구분.

* **Creation**: S01 시작 IAM 사용자를 Terraform으로 생성 (삭제됨) - 존재하지 않는 Principal ARN 입력 제거, 생성 사용자·키·AssumeRole 정책 참조.
* **Update**: [public NLB 진입과 AWS 권한 분리](decisions/2026-09-public-nlb-ingress.md) - S01 생성 사용자와 나머지 STS 시나리오의 외부 주체 입력 구분.

* **Update**: [Terraform 관리 인증과 실험 인증 분리](decisions/2026-09-terraform-management-role.md) - AWS config의 default → admin 구성과 TF_VAR Role ARN 전달, 관리 명령의 admin 프로파일 통일.

* **Creation**: [Terraform 관리 인증과 실험 인증 분리](decisions/2026-09-terraform-management-role.md) - TF_VAR 입력과 원본 IAM 사용자에서 배포 Role을 재발급하는 경로.

* **Creation**: [public NLB 진입과 AWS 권한 분리](decisions/2026-09-public-nlb-ingress.md) - S01·S07의 TCP 443 공개, 시작 IAM 주체와 backend SG 경계 유지.
* **Update**: [AWS 호스트명과 TLS 유지](decisions/2026-09-preserve-aws-hostname.md) - 로컬 uv 실행·수동 hosts 원복과 별도 방화벽 검증으로 변경.
* **Update**: [AWS API 연결 실습의 위치](decisions/2026-09-network-lab-location.md) - 공통 그림 문서를 제거하고 각 시나리오의 실험 문서에 연결·인증 그림 배치.
* **Creation**: [AWS API 연결 실습의 위치](decisions/2026-09-network-lab-location.md) - VPC endpoint 분류와 시나리오별 연결 그림의 역할.

## 2026-09-05

* **Update**: [DNS 변경 불가와 인증 방식 분리](decisions/2026-09-separate-auth-from-routing.md) - 인증서 수명·CRL 독립 기본 실습과 연결.
* **Update**: [AWS 호스트명과 TLS 유지](decisions/2026-09-preserve-aws-hostname.md) - DNS 변경 가능 시나리오로 적용 범위 명시.
* **Creation**: [DNS 변경 불가와 인증 방식 분리](decisions/2026-09-separate-auth-from-routing.md) - 인증서·endpoint URL·CONNECT proxy의 독립된 역할.
* **Creation**: Roles Anywhere 경로 근거 reference (2026-09-06 삭제) - PrivateLink 정책과 helper·proxy 지원 자료.
* **Creation**: [AWS 호스트명과 TLS 유지](decisions/2026-09-preserve-aws-hostname.md) - 고정 IP 구성에서 TLS·서명·두 API 경로를 유지하는 이유.
* **Creation**: [AWS 공식 문서 발췌](references/aws-networking-excerpts.md) - 지원 조건의 로컬 참고 자료.
