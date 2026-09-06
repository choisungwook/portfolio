# S01 환경 준비와 정리

- 대상: 인터넷·public TCP NLB·DNS 변경·STS.
- Terraform: [기본 구성](../../../terraform/).
- 이 시나리오는 default VPC와 로컬 uv 가상환경을 사용해요.

## Up

- [S01 상세 환경 준비](../../2-setup.md#up)의 변수 입력·서비스 조회·배포를 수행해요. 클라이언트는 `AWS_PROFILE`로 인증해요.
- 로컬 `/etc/hosts`에 STS·Memory의 NLB EIP를 추가해요. 상세 준비 문서의 hosts 절차를 따라요.
- 방화벽 허용 목적지: STS와 Memory NLB의 EIP, TCP 443.

## Down

- [S01 상세 정리](../../2-setup.md#down)를 수행해요.
- 성공·실패와 관계없이 실습 hosts 블록을 제거한 뒤 AWS 리소스를 삭제해요.
