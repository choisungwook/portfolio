# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-25

* **Update**: 번들의 OKF 0.2 스펙 사본을 지우고 저장소 루트의 `templates/okf-spec-0.3.md`를 참조하도록 바꾸고, 번들 index의 okf_version을 0.3으로 변경. 0.1 형식 concept 1개의 `timestamp`와 `## Citations`를 `generated`와 `sources`로 변환. 작성자를 알 수 없어 `generated.by`는 `claude-code/unknown`으로 둠.

## 2026-11-08

- **Update**: [OKF v0.2 스펙 사본](references/okf-spec-0.2.md) 0.1 사본을 0.2 원문으로 교체. 0.2부터 timestamp와 Citations 대신 generated와 sources를 씀.

## 2026-08-25

- **Creation**: [Codex 코딩 루프의 게이트는 저장소 안에서 실행한다](decisions/2026-08-local-eval-gate.md) 결정 기록. OpenAI Evals 종료 일정에 의존하지 않는 게이트를 남긴다.
