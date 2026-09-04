# Workflow 규칙

GitHub 생태계 안에서 작업한다. 글쓰기 원칙은 [philosophy.md](./philosophy.md)를 따르고, GitHub 조작 도구는 [github-tools.md](../rule-details/github-tools.md)를 따른다.

## Workspace 초기화

새 workspace에서 작업을 시작할 때, 가장 먼저 master를 최신화한다. 모든 작업이 최신 master 위에서 시작하도록 하기 위함이다.

master 최신화 절차:

```bash
git pull origin master --rebase
```

- conflict가 발생하면 해결하고 rebase를 완료한 뒤 작업을 시작한다.
- 이 최신화는 workspace 초기화 작업이다.

## 작업 상태 파일

세션은 끊긴다. 모바일과 웹에서 특히 자주 끊기고, 그때 남는 것은 git log뿐이라 어디까지 했는지 복원하는 데 비용이 든다. 그래서 단계가 3개를 넘는 작업은 실행 계획을 파일로 남긴다.

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

**MANDATORY**: 아래 세 가지는 예외 없이 지킨다.

- **작업을 시작하기 전에** 이 파일이 있는지 확인하고, 있으면 먼저 읽는다. 읽지 않고 시작하면 끝난 단계를 다시 한다.
- **단계를 끝낸 그 인터랙션에서** 체크박스를 갱신한다. 나중에 몰아서 갱신하지 않는다. 몰아서 갱신하려던 세션은 끊겨서 아무것도 갱신하지 못한다.
- 건너뛴 단계는 지우지 않고 `[-]`로 두고 이유를 한 줄 붙인다. 지우면 다음 세션이 그 단계를 처음 보는 것으로 착각한다.

이 파일은 다른 기기와 다른 세션에서 읽혀야 하므로 작업 commit에 함께 싣는다. 대신 master에는 남기지 않는다. PR을 만들기 직전에 지우고 그 삭제를 마지막 commit에 넣는다. squash merge는 마지막 상태만 남기므로 master는 깨끗하게 유지된다.

건너뛴 단계의 이유 중 다음 작업에도 유효한 것은 파일이 지워지기 전에 `knowledge/decisions/`로 옮긴다. 규칙은 [knowledge.md](./knowledge.md)를 따른다.

## GitHub Actions 작성 규칙

workflow를 만들거나 수정할 때 버전을 오래된 값으로 하드코딩하지 않는다.

- action(uses)은 최신 stable 메이저 버전을 확인해 사용한다. 예: actions/checkout, actions/setup-node
- workflow가 설치하는 도구, 모듈, 라이브러리도 최신 stable 버전을 확인해 사용한다. npm 패키지는 npm view <패키지> dist-tags.latest로, 그 외는 웹 검색으로 확인한다.
- 언어 런타임(Node 등)은 현재 LTS 버전을 사용한다.
- 상위 도구가 특정 버전 범위만 지원하면(peer dependency 등) 그 범위 안의 최신 stable을 쓰고 이유를 남긴다.

## Issue와 PR 공통 작성 규칙

- 한글 개조식으로 쓴다. 서술형 종결어미(-다, -한다, -했다, -된다)를 쓰지 않고 명사나 -음, -함으로 끝낸다.
  - 서술형: `PR body가 길어서 읽지 않게 되는 문제를 없앤다.`
  - 개조식: `길어서 읽지 않게 되는 PR body 축소`
- Goal은 번호 리스트 3개 이내로 쪼갠다. 문단으로 잇지 않는다.
- 근거는 마크다운 리스트 최대 1개다. 한 항목에 여러 근거를 나열하지 않는다.
- backtick을 사용하지 않는다.
- label은 작업 유형(예: `feat`, `docs`, `fix`)과 기술 태그(예: `kubernetes`, `aws`, `terraform`)를 함께 붙인다.

## Issue와 PR의 역할 분리

같은 내용을 두 곳에 쓰지 않는다.

- Issue: 목표와 의사결정. 왜 이 작업을 하는가.
- PR: 어려웠던 점과 감수하는 리스크. 구현하면서 실제로 겪은 것.

PR에는 목표와 의사결정을 다시 쓰지 않고 issue 링크로 대체한다.

## Issue 계층

모든 기록용 issue는 root issue의 하위 issue로 등록한다. root issue 하나가 그 그룹의 작업 전체를 모으는 지도가 된다.

- root issue는 그룹당 하나다. `product/<이름>`을 건드리면 그 product, `.claude`나 `.github`를 건드리면 저장소 규칙과 도구, 나머지는 핸즈온이다.
- root issue에는 `root` label을 붙이고 제목은 그룹 이름으로 한다. 예: `akbun-screenshot`
- root issue가 없으면 만든다. body는 그 그룹이 무엇인지 한 줄이면 된다. 하위 issue 목록은 GitHub가 자동으로 렌더링하므로 직접 적지 않는다.
- root issue는 닫지 않는다. 그룹이 살아 있는 한 열어 둔다.

하위 issue 등록은 GitHub sub-issue API로 한다. 호출 형식과 gh CLI가 없는 환경의 대체 도구는 [github-tools.md](../rule-details/github-tools.md)에 있다.

## GitHub Project

root issue와 하위 issue는 저장소 project에 담아 칸반으로 본다.

```bash
gh project item-add <project번호> --owner choisungwook --url <issue URL>
```

`read:project` scope가 없으면 이 단계는 실패한다. 실패하면 아래를 사용자에게 안내하고 issue 생성 자체는 그대로 진행한다.

```bash
gh auth refresh -s project
```

## Issue 작성 규칙

PR을 생성할 때 기록용 GitHub Issue를 함께 만들고 PR body에서 링크한다.

- 템플릿: [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)를 따른다.
- **Goal**: 작업의 목표를 번호 리스트 3개 이내로 작성한다.
- **ADR**: 의사결정 한 줄, 그 아래 이유 한 줄로 항목화한다.

## PR 작성 규칙

body 형식의 기준은 [.github/pull_request_template.md](../../.github/pull_request_template.md) 하나다. 섹션 구성과 항목 형식은 이 규칙 파일에 중복해 적지 않고 템플릿에서 읽는다.

- PR을 쓰기 전에 템플릿을 읽고 그 섹션과 형식을 그대로 따른다.
- PR을 만들기 직전에 현재 branch 이름을 확인한다. `<type>/<short-description>` 형식이 아니면 그 형식으로 바꾸고 push한 뒤 PR을 만든다. 도구가 만든 이름은 작업 내용을 설명하지 않으므로 이 시점에만 손댄다.
- 섹션마다 요약 한 줄과 근거 최대 1개다. 쓸 내용이 없는 섹션은 헤더째 지운다.
- 본문 끝에 기록용 issue를 `Issue #<number>` 형식으로 링크한다.
- target branch는 `master`로 설정한다.
- 사용자가 요청하면 git diff를 다시 읽고 PR body를 재작성한다. Issue 번호는 유지한다.
- 여러 줄 body는 UTF-8 Markdown 파일과 `--body-file`로 전달한다. 이스케이프한 줄바꿈을 `--body`로 넘기지 않는다.
- 생성 직후 GitHub에서 body를 다시 읽어 실제 줄바꿈, 템플릿 헤더, Issue 링크를 확인한다. 깨졌으면 리뷰 요청 전에 고친다.
- squash merge commit 제목 끝에는 `(#<PR 번호>)`를 붙여 commit에서 PR을 추적할 수 있게 한다.
