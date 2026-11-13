# GitHub 규칙

Issue와 PR 작성 규칙, GitHub Actions 작성 규칙, 환경별 조작 도구를 정한다.

GitHub를 건드리는 command는 세 환경 중 하나에서 돈다. 절차는 같고 도구만 다르므로, 각 command는 절차만 쓰고 도구 대응은 이 파일을 참조한다.

- **CLI 환경**: shell과 gh CLI가 있다. Claude Code CLI, Claude Desktop, Codex CLI, 터미널이 열리는 IDE가 여기에 든다.
- **MCP 환경**: shell이 없고 GitHub MCP 서버 도구만 있다. Claude mobile, ChatGPT mobile, 브라우저 세션이 여기에 든다.
- **혼합 환경**: shell과 git은 있지만 gh가 없고 GitHub MCP 도구가 있다. Claude Code 클라우드 세션이 여기에 든다. commit과 push는 shell로, GitHub 조작은 MCP 도구로 한다.

## 환경 판별

작업 시작 전에 한 번 판별하고, 그 결과를 그 작업 내내 유지한다.

```bash
gh auth status
```

- 성공하면 CLI 환경이다.
- 실패했지만 shell과 git이 있고 GitHub MCP 도구가 있으면 혼합 환경이다.
- shell 자체가 없으면 MCP 환경이다.
- gh 설치나 인증을 사용자 대신 시도하지 않는다.
- gh도 MCP 도구도 없으면 작업을 시작하지 말고 무엇이 없는지 알린다. 절반만 진행된 PR이 가장 나쁘다.

## 도구 대응

혼합 환경은 아래 표의 MCP 환경 열을 쓴다. MCP 도구 이름은 GitHub MCP 서버 버전마다 다르다. 아래는 2026-11 공식 서버 기준이고, 이름이 안 맞으면 사용 가능한 도구 목록에서 같은 일을 하는 것을 찾는다.

| 하는 일 | CLI 환경 | MCP 환경 |
|---|---|---|
| Issue 생성 | `gh issue create` | `issue_write`(method create). `parent_issue_number`를 주면 생성과 sub-issue 등록이 한 번에 된다 |
| Issue 조회 | `gh issue list`, `gh issue view` | `list_issues`, `issue_read` |
| Issue close | `gh issue close` | `issue_write`(method update, state closed) |
| Issue comment | `gh issue comment` | `add_issue_comment` |
| PR 생성 | `gh pr create` | `create_pull_request` |
| PR 조회 | `gh pr view` | `pull_request_read`(method get) |
| PR body 수정 | `gh pr edit --body-file` | `update_pull_request` |
| PR label | `gh pr edit --add-label` | `issue_write`(method update, issue_number에 PR 번호) |
| PR comment 조회 | `gh api .../comments` | `pull_request_read`(method get_review_comments, get_reviews, get_comments) |
| squash merge | `gh pr merge --squash` | `merge_pull_request` (merge_method squash) |
| sub-issue 등록 | `gh api .../sub_issues` | `sub_issue_write`(method add) |

## MCP 환경에서 안 되는 것

되는 척하지 말고 사용자가 실행할 명령을 안내한 뒤 나머지를 진행한다. 이것들 때문에 작업 전체를 멈추지 않는다. 혼합 환경은 shell이 있어 commit·push와 local branch 정리는 되고, 나머지는 MCP 환경과 같다.

- **commit과 push**: shell이 없으므로 코드 변경 자체가 불가능하다. 코드 수정이 필요한 단계는 CLI 환경에서만 돈다.
- **대기와 polling**: sleep이 없다. 시간이 걸리는 단계는 거기서 끊고, 사용자가 나중에 다시 호출하게 한다. 혼합 환경도 sleep으로 polling하지 않는다. PR 이벤트 구독 도구(`subscribe_pr_activity`)가 있으면 구독하고 턴을 끝내며, 리뷰와 CI 결과가 도착하면 세션이 다시 깨어난다.
- **local branch 정리**: merge 후 `git pull --rebase`를 대신할 수단이 없다.

## Issue와 PR 작성 규칙

형식의 기준은 템플릿 2개다. 섹션 구성과 항목 형식은 [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)와 [.github/pull_request_template.md](../../.github/pull_request_template.md)에서 읽고 이 파일에 다시 적지 않는다. 생성 절차는 [repo-pr-create.md](../commands/repo-pr-create.md)에 있다.

- PR을 생성할 때 기록용 Issue를 함께 만들고 PR 본문 끝에 `Issue #<number>` 형식으로 링크한다.
- target branch는 `master`다.
- PR을 만들기 직전에 현재 branch 이름을 확인한다. `<type>/<short-description>` 형식이 아니면 그 형식으로 바꾸고 push한 뒤 PR을 만든다. 실행 환경이 지정한 branch에만 push하도록 제한하면(클라우드 세션 등) 이름을 바꾸지 않고 결과 보고에 건너뛴 단계로 남긴다.
- 사용자가 요청하면 git diff를 다시 읽고 PR body를 재작성한다. Issue 번호는 유지한다.
- squash merge commit 제목 끝에는 `(#<PR 번호>)`를 붙여 commit에서 PR을 추적할 수 있게 한다.
- Issue body, PR body, commit message에 claude session 링크를 넣지 않는다.

## Issue와 PR 문체

- 한글 개조식으로 쓴다. 서술형 종결어미(-다, -한다, -했다, -된다)를 쓰지 않고 명사나 -음, -함으로 끝낸다.
  - 서술형: `PR body가 길어서 읽지 않게 되는 문제를 없앤다.`
  - 개조식: `길어서 읽지 않게 되는 PR body 축소`
- 명령, 파일 경로, 식별자는 backtick으로 감싼다. Issue와 PR의 독자가 agent이고, agent는 그 값을 그대로 실행하거나 검색한다. 강조에는 쓰지 않는다.
- label은 작업 유형(예: `feat`, `docs`, `fix`)과 기술 태그(예: `kubernetes`, `aws`, `terraform`)를 함께 붙인다.

## Issue와 PR의 역할 분리

같은 내용을 두 곳에 쓰지 않는다.

- Issue: 왜 하나, 무엇이면 끝인가, 무엇을 골랐고 무엇을 버렸나.
- PR: 어떤 방식으로 했나, 어떻게 증명했나, 무엇을 감수하고 어떻게 되돌리나.

예외는 맨 위 작업 목적 절 하나다. 사람이 두 문서에서 그 절만 읽으므로 Issue와 PR 양쪽에 2줄 이내로 적는다.

그 밖의 issue 내용은 PR에 다시 쓰지 않고 issue 링크로 대체한다. 두 문서는 issue의 완료 조건과 PR의 검증 절에서 연결된다.

## Issue 계층

모든 기록용 issue는 root issue의 하위 issue로 등록한다. root issue 하나가 그 그룹의 작업 전체를 모으는 지도가 된다.

- root issue는 그룹당 하나다. `product/<이름>`을 건드리면 그 product, `.claude`나 `.github`를 건드리면 저장소 규칙과 도구, 나머지는 핸즈온이다.
- root issue에는 `root` label을 붙이고 제목은 그룹 이름으로 한다. 예: `akbun-screenshot`
- root issue가 없으면 만든다. body는 그 그룹이 무엇인지 한 줄이면 된다. 하위 issue 목록은 GitHub가 자동으로 렌더링하므로 직접 적지 않는다.
- root issue는 닫지 않는다. 그룹이 살아 있는 한 열어 둔다.

하위 issue 등록 방법은 아래 "sub-issue 등록"에 있다.

## GitHub Actions 작성 규칙

workflow를 만들거나 수정할 때 버전을 오래된 값으로 하드코딩하지 않는다.

- action(uses)은 최신 stable 메이저 버전을 확인해 사용한다. 예: actions/checkout, actions/setup-node
- workflow가 설치하는 도구, 모듈, 라이브러리도 최신 stable 버전을 확인해 사용한다. npm 패키지는 npm view <패키지> dist-tags.latest로, 그 외는 웹 검색으로 확인한다.
- 언어 런타임(Node 등)은 현재 LTS 버전을 사용한다.
- 상위 도구가 특정 버전 범위만 지원하면(peer dependency 등) 그 범위 안의 최신 stable을 쓰고 이유를 남긴다.

## MCP로 만든 PR의 자동 footer

일부 MCP 서버는 PR body 끝에 claude session 링크 footer를 자동으로 붙인다.

- PR을 만든 직후 body를 다시 읽는다.
- footer가 붙었으면 원래 body로 한 번 더 update한다. update에는 footer가 다시 붙지 않는다.

## sub-issue 등록

어느 환경이든 하위 issue는 issue number가 아니라 database id로 넘긴다. 이것이 가장 흔한 실패다.

```bash
CHILD_ID=$(gh api repos/choisungwook/portfolio/issues/<하위번호> --jq .id)
gh api --method POST repos/choisungwook/portfolio/issues/<root번호>/sub_issues -F sub_issue_id=$CHILD_ID
```

MCP 환경과 혼합 환경에서는 Issue를 만들 때 `issue_write`에 `parent_issue_number`(root issue의 number)를 주면 따로 등록할 필요가 없다. 이미 있는 Issue를 걸 때만 `sub_issue_write`를 쓰고, `sub_issue_id`에는 `issue_read`로 조회한 그 Issue의 `id` 필드를 넣는다. `number`를 넘기면 조용히 엉뚱한 issue가 걸린다.
