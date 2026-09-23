# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [컨테이너에 로컬 자격 증명을 넣지 않고 컴포넌트마다 IAM role을 둔다](2026-09-iam-role-per-component.md) - 로컬 profile은 terraform과 CLI 조회에만, 수집기·Grafana·AMG는 각자 role로 서명한다.
