# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-08

* **Update**: [OKF v0.2 스펙 사본](references/okf-spec-0.2.md) 0.1 사본을 0.2 원문으로 교체. 0.2부터 timestamp와 Citations 대신 generated와 sources를 씀.

## 2026-11-07

* **Creation**: [새 IAM 사용자와 설정 스위치로 전환](decisions/2026-11-new-iam-user-with-switch.md) 결정 기록. in-place ALTER USER가 새 password 로그인을 즉시 끊는 것을 실측해 남긴다.
* **Creation**: [application status check는 awscc와 terraform_data](decisions/2026-11-app-status-check-awscc.md) 결정 기록. provider 미지원 우회 방법을 남긴다.
* **Creation**: [Aurora Serverless v2 0.5~2 ACU](decisions/2026-11-serverless-v2-cost.md) 결정 기록. 실습 DB 사양과 단가 근거를 남긴다.
