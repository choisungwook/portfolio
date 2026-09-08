# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [AWS 안의 CONNECT proxy(S07)는 권장 구성이 아니다](2026-09-no-connect-proxy-in-aws.md) - IAM이 인증·인가를 담당하므로 프록시 홉 불필요. 필요하면 클라이언트 네트워크 쪽에.
* [PoC 범위를 S01·S05·S07로 축소](2026-09-poc-scope-s01-s05-s07.md) - 인터넷 고정 EIP 목적에 맞는 3개만 유지, VPN·Roles Anywhere 시나리오 삭제.
* [클라이언트는 로컬 AWS 프로파일로 시작](2026-09-client-profile-principal.md) - trusted_principal_arn 입력, IAM 사용자·키·비밀 output 제거.

* [Terraform 관리 인증과 실험 인증 분리](2026-09-terraform-management-role.md) - A의 credential_process 자동 갱신과 B의 임시 키 재발급, provider 인증 입력 제거.

* [public NLB 진입과 AWS 권한 분리](2026-09-public-nlb-ingress.md) - 전체 IPv4의 TCP 443 공개와 IAM·backend 경계 유지.
* [AWS API 연결 실습의 위치](2026-09-network-lab-location.md) - VPC endpoint 분류와 시나리오 안의 아키텍처 배치.
* [AWS 호스트명과 TLS 유지](2026-09-preserve-aws-hostname.md) - TCP NLB 분리와 로컬 hosts 설정·원복의 이유.
* [DNS 변경 불가와 인증 방식 분리](2026-09-separate-auth-from-routing.md) - VPCE·CONNECT proxy 선택과 독립 인증서 실습의 경계.
* [자체 도메인 TLS 재암호화 직결(S06)은 opt-in 실험](2026-09-own-domain-tls-nlb-s06.md) - root state opt-in, 서비스별 TLS NLB, 판정은 실제 실행 뒤에 기록.
