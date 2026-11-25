# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-25

* **Update**: 번들의 OKF 0.2 스펙 사본을 지우고 저장소 루트의 `templates/okf-spec-0.3.md`를 참조하도록 바꾸고, 번들 index의 okf_version을 0.3으로 변경. 0.1 형식 concept 3개의 `timestamp`와 `## Citations`를 `generated`와 `sources`로 변환. 작성자를 알 수 없어 `generated.by`는 `claude-code/unknown`으로 둠.

## 2026-11-08

* **Update**: [OKF v0.2 스펙 사본](references/okf-spec-0.2.md) 0.1 사본을 0.2 원문으로 교체. 0.2부터 timestamp와 Citations 대신 generated와 sources를 씀.

## 2026-09-24

* **Creation**: [문서 순서는 EC2 단독을 EKS보다 앞에 두고, 실습 문서는 원리·실습·트러블슈팅·정리 구조로 쓴다](decisions/2026-09-doc-order-ec2-first.md) 결정 기록. 처음 구성(EKS 먼저)을 바꾼 이유를 남김.

## 2026-09-23

* **Creation**: [EKS addon 버전을 넘기지 않고 self-managed 기본 설치에 맡긴다](decisions/2026-09-eks-self-managed-addons.md) 결정 기록. addon 버전 조회 계획을 바꾼 이유를 남김.
* **Creation**: [Bottlerocket EC2는 저장소 terraform 규칙의 AMI, 볼륨 기본값을 따르지 않는다](decisions/2026-09-terraform-rule-exceptions.md) 결정 기록. 저장소 규칙과 다르게 한 이유를 남김.
