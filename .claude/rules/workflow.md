# Workflow 규칙

모든 작업에 걸리는 절차만 둔다. Issue, PR, GitHub Actions 규칙은 [github-tools.md](../rule-details/github-tools.md)에 있다.

## Workspace 초기화

새 workspace에서 작업을 시작할 때, 가장 먼저 master를 최신화한다. 모든 작업이 최신 master 위에서 시작하도록 하기 위함이다.

master 최신화 절차:

```bash
git pull origin master --rebase
```

- conflict가 발생하면 해결하고 rebase를 완료한 뒤 작업을 시작한다.

## 작업 상태 파일

세션은 끊긴다. 모바일과 웹에서 특히 자주 끊기고, 그때 남는 것은 git log뿐이라 어디까지 했는지 복원하는 데 비용이 든다. 그래서 단계가 3개 이상인 작업은 실행 계획을 파일로 남긴다.

- 경로는 `.claude/work/<branch 이름의 슬래시를 하이픈으로 바꾼 값>.md`다. 예: branch `feat/rule-routing`이면 `.claude/work/feat-rule-routing.md`
- 단계가 1~2개로 끝나는 작업은 만들지 않는다. 파일을 만드는 비용이 얻는 것보다 크다.
- Issue를 대신하지 않는다. Issue에는 목표와 의사결정이, 이 파일에는 실행 순서와 현재 위치가 있다.

상태 파일 형식:

```markdown
# <작업 한 줄 요약>

- Issue: #<번호>
- Branch: <branch 이름>

## 실행 계획

- [x] 1. 규칙 파일을 rule-details로 이동
- [ ] 2. 인덱스에 라우팅 표 작성
- [-] 3. hook으로 강제 — 건너뜀: agent마다 hook 설정이 달라 규칙 문구로 대체

## 다음 세션이 알아야 할 것

- 상대 링크는 rules와 rule-details가 같은 깊이라 이동해도 깨지지 않음
```

세 가지를 지킨다.

- 작업을 시작하기 전에 이 파일이 있는지 확인하고, 있으면 먼저 읽는다. 읽지 않고 시작하면 끝난 단계를 다시 한다.
- 단계를 끝낸 그 인터랙션에서 체크박스를 갱신한다. 몰아서 갱신하려던 세션은 끊겨서 아무것도 갱신하지 못한다.
- 건너뛴 단계는 지우지 않고 `[-]`로 두고 이유를 한 줄 붙인다. 지우면 다음 세션이 그 단계를 처음 보는 것으로 착각한다.

이 파일은 다른 기기와 다른 세션에서 읽혀야 하므로 작업 commit에 함께 싣는다. 대신 master에는 남기지 않는다. PR을 만들기 직전에 지우고 그 삭제를 마지막 commit에 넣는다. squash merge는 마지막 상태만 남기므로 master는 깨끗하게 유지된다.

건너뛴 단계의 이유 중 다음 작업에도 유효한 것은 파일이 지워지기 전에 `knowledge/decisions/`로 옮긴다. 규칙은 [knowledge.md](./knowledge.md)를 따른다.
