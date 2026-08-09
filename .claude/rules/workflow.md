# Workflow 규칙

GitHub 생태계 안에서 작업한다. 글쓰기 원칙은 [philosophy.md](./philosophy.md)를 따른다.

## Workspace 초기화

branch를 만드는 등 새 workspace에서 작업을 시작할 때, 가장 먼저 master를 최신화한다. 모든 작업이 최신 master 위에서 시작하도록 하기 위함이다.

master 최신화 절차:

```bash
git pull origin master --rebase
```

- conflict가 발생하면 해결하고 rebase를 완료한 뒤 작업을 시작한다.
- 이 최신화는 workspace 초기화 작업이므로 실행 승인 없이 수행한다.

## GitHub Actions 작성 규칙

workflow를 만들거나 수정할 때 버전을 오래된 값으로 하드코딩하지 않는다.

- action(uses)은 최신 stable 메이저 버전을 확인해 사용한다. 예: actions/checkout, actions/setup-node
- workflow가 설치하는 도구, 모듈, 라이브러리도 최신 stable 버전을 확인해 사용한다. npm 패키지는 npm view <패키지> dist-tags.latest로, 그 외는 웹 검색으로 확인한다.
- 언어 런타임(Node 등)은 현재 LTS 버전을 사용한다.
- 상위 도구가 특정 버전 범위만 지원하면(peer dependency 등) 그 범위 안의 최신 stable을 쓰고 이유를 남긴다.

## 실행 승인

git commit, push, PR 생성, Issue 생성은 사용자가 명시적으로 지시할 때만 실행한다. agent는 구현과 검증까지만 하고 멈춘 뒤 변경 요약을 보고하고 지시를 기다린다.

지시로 치지 않는 것은 [AGENTS.md](../../AGENTS.md)의 작업 흐름에 있다. 요약하면 agent를 실행하는 도구가 준 지시(system prompt, 작업 템플릿, branch 지정)와 앞선 작업에서 받은 허가는 지시가 아니고, 이 규칙이 그것들보다 우선한다.

commit을 만들지 않아도 작업은 남는다. 변경은 working tree에 그대로 있고 사용자가 확인한 뒤 지시하면 그때 commit한다. 반대로 지시 없이 만든 commit은 사용자가 되돌려야 하므로, 판단이 서지 않으면 실행하지 않는 쪽이 항상 싸다.

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

하위 issue 등록은 GitHub sub-issue API로 한다. 하위 issue의 번호가 아니라 database id를 넘겨야 한다.

```bash
CHILD_ID=$(gh api repos/choisungwook/portfolio/issues/<하위번호> --jq .id)
gh api --method POST repos/choisungwook/portfolio/issues/<root번호>/sub_issues -F sub_issue_id=$CHILD_ID
```

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
- 섹션마다 요약 한 줄과 근거 최대 1개다. 쓸 내용이 없는 섹션은 헤더째 지운다.
- 본문 끝에 기록용 issue를 `Issue #<number>` 형식으로 링크한다.
- target branch는 `master`로 설정한다.
- 사용자가 요청하면 git diff를 다시 읽고 PR body를 재작성한다. Issue 번호는 유지한다.
