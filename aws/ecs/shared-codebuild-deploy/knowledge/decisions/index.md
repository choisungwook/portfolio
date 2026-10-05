# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [Terraform으로 최초 생성, 추출한 JSON을 Git에서 관리](2026-10-git-task-template.md) - 재현 가능한 생성 순서와 필수 IMAGE_TAG.
* [배포 완료는 rolloutState를 직접 조회해 판정](2026-10-deployment-guard-scope.md) - wait services-stable의 조기 종료와 롤백 성공 오판 방지.
* [모노레포 소스 전달을 clone 참조로 전환](2026-10-source-clone-reference.md) - 저장소 분리 없이 전체 ZIP 반복 저장을 줄이는 선택.
* [task definition 변경 미리 보기는 PR comment로](2026-10-pr-task-diff.md) - OIDC 읽기 전용 role과 comment 실행 권한 제한.
