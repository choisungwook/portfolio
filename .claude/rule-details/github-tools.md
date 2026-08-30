# GitHub 조작 도구 규칙

GitHub를 건드리는 command는 두 환경 중 하나에서 돈다. 절차는 같고 도구만 다르므로, 각 command는 절차만 쓰고 도구 대응은 이 파일을 참조한다.

- **CLI 환경**: shell과 gh CLI가 있다. Claude Code CLI, Claude Desktop, Codex CLI, 터미널이 열리는 IDE가 여기에 든다.
- **MCP 환경**: shell이 없고 GitHub MCP 서버 도구만 있다. Claude mobile, ChatGPT mobile, 브라우저 세션이 여기에 든다.

## 환경 판별

작업 시작 전에 한 번 판별하고, 그 결과를 그 작업 내내 유지한다.

```bash
gh auth status
```

- 성공하면 CLI 환경이다.
- shell 자체가 없거나 gh가 없거나 인증이 안 되어 있으면 MCP 환경으로 내려간다. gh 설치나 인증을 사용자 대신 시도하지 않는다.
- 둘 다 없으면 작업을 시작하지 말고 무엇이 없는지 알린다. 절반만 진행된 PR이 가장 나쁘다.

## 도구 대응

MCP 도구 이름은 GitHub MCP 서버 버전마다 다르다. 아래는 공식 서버 기준이고, 이름이 안 맞으면 사용 가능한 도구 목록에서 같은 일을 하는 것을 찾는다.

| 하는 일 | CLI 환경 | MCP 환경 |
|---|---|---|
| Issue 생성 | `gh issue create` | `create_issue` |
| Issue 조회 | `gh issue list`, `gh issue view` | `list_issues`, `get_issue` |
| Issue close | `gh issue close` | `update_issue` (state closed) |
| Issue comment | `gh issue comment` | `add_issue_comment` |
| PR 생성 | `gh pr create` | `create_pull_request` |
| PR 조회 | `gh pr view` | `get_pull_request` |
| PR comment 조회 | `gh api .../comments` | `get_pull_request_comments`, `get_pull_request_reviews` |
| Copilot 리뷰 요청 | `gh pr edit --add-reviewer "@copilot"` | `request_copilot_review` |
| squash merge | `gh pr merge --squash` | `merge_pull_request` (merge_method squash) |
| sub-issue 등록 | `gh api .../sub_issues` | `add_sub_issue` |

## MCP 환경에서 안 되는 것

되는 척하지 말고 사용자가 실행할 명령을 안내한 뒤 나머지를 진행한다. 이것들 때문에 작업 전체를 멈추지 않는다.

- **commit과 push**: shell이 없으므로 코드 변경 자체가 불가능하다. 코드 수정이 필요한 단계는 CLI 환경에서만 돈다.
- **대기와 polling**: sleep이 없다. 시간이 걸리는 단계는 거기서 끊고, 사용자가 나중에 다시 호출하게 한다.
- **GraphQL mutation**: Copilot 재요청(`requestReviewsByLogin`)이 안 된다. 최초 요청만 된다.
- **project 담기**: `gh project item-add`에 해당하는 도구가 없다.
- **local branch 정리**: merge 후 `git pull --rebase`를 대신할 수단이 없다.

## sub-issue 등록

두 환경 모두 issue number가 아니라 database id를 넘긴다. 이것이 가장 흔한 실패다.

```bash
CHILD_ID=$(gh api repos/choisungwook/portfolio/issues/<하위번호> --jq .id)
gh api --method POST repos/choisungwook/portfolio/issues/<root번호>/sub_issues -F sub_issue_id=$CHILD_ID
```

MCP 환경에서는 `create_issue` 응답의 `id` 필드를 그대로 쓴다. 응답에 있는 `number`를 넘기면 조용히 엉뚱한 issue가 걸린다.
