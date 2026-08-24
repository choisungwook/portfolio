# Codex 평가 루프 핸즈온

Codex가 코드를 수정하고 결정론적 train·holdout 게이트가 출시 여부를 판단하는 핸즈온이다.

@../../../AGENTS.md

## 변경 범위

- 실습 에이전트는 `candidate/path_policy.py`만 수정한다.
- `cases/`, `scripts/`, `tests/`, `task.md`는 심판이므로 수정하지 않는다.
- 코치에게 `cases/holdout.json`의 내용과 실패 이유를 전달하지 않는다.

## knowledge 갱신

이 workspace의 작업에서 얻은 지식은 `knowledge/`에 계속 반영한다. 추가만이 아니라 수정과 삭제까지 포함한다.

- 새로 알게 된 의사결정, 반복 절차, 도메인 통찰은 concept로 추가한다.
- 기존 concept와 어긋나는 사실을 알게 되면 그 concept를 고친다. 새 파일을 만들어 두 개를 남기지 않는다.
- 더 이상 맞지 않는 concept는 지운다. 틀린 기록을 남겨 두면 다음 작업이 그것을 믿는다.
- 추가·수정·삭제 뒤에는 해당 `index.md`와 `log.md`를 같은 commit에서 갱신한다.

작성 형식은 [../../../.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
