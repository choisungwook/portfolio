# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [실습 환경을 docker와 EC2(AL2023 x86_64)로 나눈다](2026-09-lab-environment-split.md) - dm-verity 사용자 공간은 docker, SELinux와 커널 dm-verity는 EC2.
