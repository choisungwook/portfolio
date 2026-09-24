# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [EKS addon 버전을 넘기지 않고 self-managed 기본 설치에 맡긴다](2026-09-eks-self-managed-addons.md) - 1.36 addon 버전을 추측해 박지 않고 EKS 기본 설치를 쓴다.
* [Bottlerocket EC2는 저장소 terraform 규칙의 AMI, 볼륨 기본값을 따르지 않는다](2026-09-terraform-rule-exceptions.md) - SSM parameter AMI 조회, 데이터 볼륨만 크기 지정, SSH는 SSM port forwarding.
* [문서 순서는 EC2 단독을 EKS보다 앞에 두고, 실습 문서는 원리·실습·트러블슈팅·정리 구조로 쓴다](2026-09-doc-order-ec2-first.md) - 입문자가 Bottlerocket과 클러스터 문제를 분리해 익히도록 EC2 실습을 먼저 두고 문서 구조를 통일한다.
