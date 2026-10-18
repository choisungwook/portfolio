---
description: 기록용 Issue와 PR을 만든다. root issue의 하위로 걸고 템플릿을 따른다
allowed-tools: Bash, Read, Glob, Grep
---

현재 branch의 작업을 Issue와 PR로 만든다.

## 순서

1. `git status`와 `git diff origin/master...HEAD`로 변경을 확인한다.
2. 변경이 `product/<이름>/`을 건드렸으면 [product/products.json](../../product/products.json)을 같은 commit에서 갱신한다. 아래 "제품 카탈로그 갱신"을 따른다.
3. PR 직전 리뷰를 한다. 아래 "PR 직전 리뷰"를 따른다. Important를 고쳤으면 그 수정도 이번 commit에 들어간다.
4. 작업 상태 파일 `.claude/work/<branch>.md`가 있으면 정리한다. 건너뛴 단계의 이유 중 다음 작업에도 유효한 것을 `knowledge/decisions/`로 옮긴 뒤 파일을 지운다. 이 삭제가 마지막 commit에 들어가야 master에 남지 않는다.
5. commit할 변경이 남아 있으면 commit한다. commit message에 claude session 링크(claude.ai/code 링크, Co-Authored-By 아래 붙는 세션 URL)가 있으면 제거한다.
6. push한다.
7. 이번 작업의 root issue를 정한다. `product/<이름>`을 건드렸으면 그 product, `.claude`나 `.github`면 저장소 규칙과 도구, 나머지는 핸즈온이다. `gh issue list --label root --state open`으로 찾고 없으면 만든다.
8. 기록용 Issue를 만든다. [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)를 따라 Why, Goal, 완료 조건, ADR을 채운다. 변경에 목표가 다른 기능이 여럿이면 기능마다 Issue를 하나씩 만든다. 목표가 하나면 Issue도 하나다.
9. 8의 Issue를 모두 7의 root issue 하위로 건다. sub-issue 등록 형식은 [.claude/rule-details/github-tools.md](../rule-details/github-tools.md)에 있다.
10. root issue와 새 Issue를 project에 담는다. scope 부족으로 실패하면 안내만 하고 넘어간다.
11. PR을 만든다. [.github/pull_request_template.md](../../.github/pull_request_template.md)를 읽고 그 섹션과 형식을 그대로 따른다. Issue가 여럿이어도 PR은 하나다. 본문 끝에 Issue #<number> 형식으로 8의 Issue를 모두 링크한다. target branch는 master다.
12. GitHub에서 PR body를 다시 읽어 실제 줄바꿈과 Issue 링크를 검증한다. 깨졌으면 같은 body 파일로 수정하고 다시 검증한다.
13. Issue와 PR에 작업 유형 label(feat, docs, fix 등)과 기술 label을 함께 붙인다.

## 환경

GitHub 조작 도구는 [.claude/rule-details/github-tools.md](../rule-details/github-tools.md)를 따른다. shell이 없는 MCP 환경에서는 5, 6단계(commit과 push)를 할 수 없으므로, 커밋되지 않은 변경이 남아 있으면 시작하지 말고 알린다.

## PR 직전 리뷰

작성 세션은 자기 diff의 빈틈을 못 본다. 그래서 PR을 만들기 전에 새 컨텍스트의 리뷰어가 diff만 보고 한 번 읽는다.

- `/code-review`가 있으면 그것을 쓴다. 없으면 Agent 도구로 서브에이전트를 띄우고 `git diff origin/master...HEAD`와 [.github/copilot-instructions.md](../../.github/copilot-instructions.md)를 넘긴다. 작성 과정의 대화는 넘기지 않는다.
- 리뷰어는 copilot-instructions.md의 finding 형식과 요약 형식을 그대로 따른다. Copilot이 PR에서 하는 리뷰와 같은 기준이어야 PR에서 새 지적이 줄어든다.
- Important는 고치고, 같은 종류의 다른 위치도 함께 고친다. Nit은 고치되 그것만으로 라운드를 늘리지 않는다. Pre-existing은 고치지 않고 결과 보고에 Issue 후보로 남긴다.
- 리뷰는 1회다. 고친 뒤 다시 돌리지 않는다. 고친 것은 Copilot이 PR에서 다시 본다.
- 결과는 PR 검증 절의 마지막 항목에 건수로 적는다. 예: 서브에이전트 리뷰: Important 2건 모두 고침, Nit 1건 반영.

## 제품 카탈로그 갱신

[product/products.json](../../product/products.json)은 <https://products.akbun.com> 이 GitHub raw로 읽는 제품 목록이다. master에 들어가는 순간 사이트에 반영되므로, product를 건드린 PR이 이 파일을 빼먹으면 사이트가 그 자리에서 낡는다.

- 새 product 디렉터리를 만들었으면 `products` 배열 맨 앞에 항목을 추가한다. `id`는 디렉터리 이름, `released`는 오늘 날짜(YYYY-MM-DD), `kind`는 web, desktop, backend, skin, reference 중 하나다. kind가 web이면 배포 도메인을 `site`에 반드시 적는다.
- 기존 product의 설명이 바뀌었으면 그 항목의 `description`을 [product/README.md](../../product/README.md)의 같은 행과 같은 문장으로 맞춘다.
- 배포 URL이 새로 생겼거나 바뀌었으면 `site`를 고친다.
- 어느 쪽이든 문서 최상단의 `updated`를 오늘 날짜로 바꾼다.
- 고칠 것이 없으면(코드만 바뀐 경우) 건드리지 않는다.

## 작성 규칙

- commit message는 영어로, Issue와 PR body는 한글 개조식으로 쓴다. 종결어미(-다, -한다, -했다)를 쓰지 않고 명사나 -음, -함으로 끝낸다.
- Goal은 번호 리스트 3개 이내로 쪼갠다. 요약형과 목록형 절의 항목 규칙은 템플릿 상단 주석을 따른다. backtick을 쓰지 않는다.
- 왜, 완료 조건, 의사결정은 Issue에만 쓴다. PR에는 다시 쓰지 않고 링크만 남긴다.
- PR의 검증 절은 Issue의 완료 조건마다 한 줄로 답한다. 항목마다 실행한 명령이나 CI job과 본 결과를 적는다. 실행하지 않은 조건은 검증하지 않음으로 적는다.
- PR body와 Issue body 어디에도 claude session 링크를 넣지 않는다.
- 나머지는 [.claude/rules/workflow.md](../rules/workflow.md)를 따른다.

## body 전달과 검증

- 여러 줄 body는 UTF-8 Markdown 파일로 만든다.
- CLI 환경은 `gh issue create --body-file <파일>`과 `gh pr create --body-file <파일>`을 사용한다.
- 여러 줄 body를 `--body` 인자나 이스케이프한 `\n` 문자열로 전달하지 않는다.
- PR 생성 직후 `gh pr view "$PR" --json body -q .body`로 저장된 body를 다시 읽는다.
- 재조회한 body에 문자 그대로의 `\n`이 있거나 템플릿 헤더와 Issue 링크가 없으면 `gh pr edit "$PR" --body-file <파일>`로 고친다.
- 수정 뒤에도 검증에 실패하면 리뷰 요청 전에 멈춘다.
