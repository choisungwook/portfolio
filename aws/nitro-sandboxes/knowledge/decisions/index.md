# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [EC2는 서울, EKS는 us-west-2 Auto Mode로 실습한다](2026-11-region-and-node-choice.md) - EKS sandboxing의 리전, 버전 제약과 Auto Mode 선택 이유.
* [저장소 terraform 기본값과 다르게 만든 부분](2026-11-terraform-rule-exceptions.md) - 전용 VPC, SSH 내 IP 제한, m7g.large, kernel 6.18 AMI를 쓴 이유.
