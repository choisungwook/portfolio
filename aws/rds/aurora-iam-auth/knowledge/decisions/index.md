# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [password에서 IAM 인증으로의 전환은 새 IAM 사용자와 설정 스위치로 한다](2026-11-new-iam-user-with-switch.md) - ALTER USER 대신 app_iam을 새로 만들고 SSM 스위치로 전환, 잠금 후 삭제.
* [EC2 application status check는 awscc와 terraform_data로 만든다](2026-11-app-status-check-awscc.md) - hashicorp/aws 미지원이라 검사는 awscc, 연결은 local-exec.
* [실습 DB는 Aurora Serverless v2 0.5~2 ACU로 둔다](2026-11-serverless-v2-cost.md) - provisioned보다 싸고 IAM 인증 메모리 여유를 최대 ACU로 확보.
