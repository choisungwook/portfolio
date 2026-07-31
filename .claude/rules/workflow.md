# Workflow 규칙

GitHub 생태계 안에서 작업한다. 글쓰기 원칙은 [philosophy.md](./philosophy.md)를 따른다.

## Workspace 초기화

worktree나 branch를 만드는 등 새 workspace에서 작업을 시작할 때, 가장 먼저 master를 최신화한다. 모든 작업이 최신 master 위에서 시작하도록 하기 위함이다.

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

## Issue와 PR 공통 작성 규칙

- 문어체로 간단명료하게 작성한다. 주절주절 설명하지 않는다.
- backtick을 사용하지 않는다.
- label은 작업 유형(예: `feat`, `docs`, `fix`)과 기술 태그(예: `kubernetes`, `aws`, `terraform`)를 함께 붙인다.

## Issue 작성 규칙

PR을 생성할 때 기록용 GitHub Issue를 함께 만들고 PR body에서 링크한다.

- 템플릿: [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)를 따른다.
- **Goal**: 작업의 목표를 2문장 미만으로 작성한다.
- **ADR**: 작업 중 내린 의사결정을 "결정 - 이유" 형태로 항목화한다.

## PR 작성 규칙

- 템플릿: [.github/pull_request_template.md](../../.github/pull_request_template.md)를 따른다.
- **Goal**: 해결하려는 문제 또는 공부하려는 주제를 3문장 미만으로 작성한다.
- **How I solved it**: 해결 과정 또는 정리한 내용을 항목으로 작성한다.
- 본문 끝에 기록용 issue를 `Issue #<number>` 형식으로 링크한다.
- target branch는 `master`로 설정한다.
- 사용자가 요청하면 git diff를 다시 읽고 PR body를 재작성한다. Issue 번호는 유지한다.
