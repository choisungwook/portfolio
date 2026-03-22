# Portfolio Repository — Agent Workflow Guide

이 레포지토리에서 작업할 때 따라야 할 가이드다. 모든 작업은 GitHub Issue에서 시작하고, 모든 작업 이력은 GitHub에 남긴다. 코드든 문서든, 임시 채팅이 아니라 Issue/PR/Comment에 기록해야 나중에 추적할 수 있다.

<workflow>

모든 작업은 이 흐름을 따른다.

1. Issue 생성 — 작업의 시작점. 뭘 할 건지 먼저 기록한다.
2. Worktree 생성 — 격리된 환경에서 작업한다.
3. 작업 수행 — 코드, 문서 등 실제 작업.
4. Commit — `suggest-git-commit-message` skill로 메시지를 생성한다.
5. PR 생성 — `create-github-pr` skill로 PR을 만든다.

Review, Merge, Worktree 정리는 사용자가 직접 한다.

Issue는 단순한 할일 목록이 아니라, 이 레포의 작업 추적 시스템이다. 작업을 시작하기 전에 기존 이슈를 확인하고, 없으면 새로 만든다.

```bash
gh issue list --state open
gh issue create --title "작업 제목" --body "작업 내용" --label "feat"
```

큰 작업은 sub-issue로 분할하면 여러 agent가 병렬로 처리할 수 있다.

```bash
gh issue create --title "하위 작업" --body "Parent: #<parent-number>"
```

Issue body에는 두 가지를 담는다: 작업 내용과 TODO.

작업 내용에는 무엇을 왜 하는지, 어떤 디렉터리에서 작업하는지를 적는다. TODO는 체크박스 목록으로 할 일을 나열한다. 처음부터 완벽할 필요 없다 — 작업하면서 추가하거나 수정하면 된다. 이렇게 해야 다른 agent가 "지금 뭘 하고 있고, 뭐가 남았는지"를 바로 파악할 수 있다.

파일/디렉터리 목록을 미리 설계하지 않는다. 작업 범위를 미리 확정하면 아직 필요한지도 모르는 것까지 만들게 되기 때문이다. 범위는 TODO에서 자연스럽게 드러난다.

```bash
gh issue create --title "CDN 캐시 위험성 핸즈온" --body "$(cat <<'EOF'
## 작업 내용
CDN 캐시 키에 Cookie를 포함하지 않을 때 발생하는 개인정보 노출 문제 재현
작업 디렉터리: computer_science/dangerous_cache/

## TODO
- [ ] CDN 캐시 개념과 위험성 문서 작성
- [ ] Docker로 로컬 재현 환경 구성
- [ ] Docker 실습 가이드 작성
EOF
)" --label "hands-on" --label "cache"
```

Label은 두 종류를 함께 붙인다:

- 작업 유형: `docs`, `feat`, `fix`, `refactor`, `hands-on`
- 기술 태그: `kubernetes`, `aws`, `terraform`, `cilium`, `cache` 등. 새로운 기술이 등장하면 그 이름으로 label을 추가한다.

진행 상황이나 의사결정은 issue comment로 남긴다. 이렇게 해야 나중에 "왜 이렇게 했지?"를 추적할 수 있다.

```bash
gh issue comment <number> --body "진행 상황 메모"
```

PR은 `create-github-pr` skill을 사용한다 — 직접 `gh pr create`를 호출하면 형식이 일관되지 않기 때문이다. PR body에 `Closes #<number>`를 넣어서 Issue와 연결하고, target branch는 `master`다.

Commit 메시지는 `suggest-git-commit-message` skill을 사용한다. Conventional Commits 형식(`feat(scope): subject`)을 따르고, pre-commit hook이 실패하면 문제를 고친 뒤 새 commit을 만든다. amend는 하지 않는다 — 이력이 사라지기 때문이다.

대규모 조사 결과처럼 PR description에 담기엔 긴 내용은 `docs/` 디렉터리에 파일로 작성하고, issue에서 링크한다.

</workflow>

<git-worktree>

branch checkout 대신 git worktree를 사용한다. 여러 agent가 동시에 작업할 때 branch switching이 충돌을 일으키지만, worktree는 각각 독립된 working directory를 가지므로 이 문제가 없다. `.gitignore`에 `worktree/`가 이미 등록되어 있다.

Claude Code 등 AI Agent는 수동으로 worktree를 관리할 때는 이렇게 한다:

```bash
git worktree add ../portfolio-<topic> -b <branch-name>
git worktree list
git worktree remove ../portfolio-<topic>
```

Branch 이름은 `<type>/<short-description>` 패턴을 따른다. 예를 들어 `feat/cloudfront-cache-demo`, `docs/cilium-networkpolicy`, `fix/readme-links`. type은 `feat`, `docs`, `fix`, `refactor`, `chore` 중 하나다. Claude Code가 자동 생성하는 `claude/...` 패턴도 괜찮다.

여러 agent가 동시에 작업할 때 핵심 원칙은 **파일 단위 분할**이다. 각 agent가 고유한 파일을 담당하고, 같은 파일을 두 agent가 동시에 수정하지 않는다. 작업을 시작하기 전에 `gh issue list --state open`과 `gh pr list --state open`으로 다른 agent가 뭘 하고 있는지 확인한다.

</git-worktree>

<doc-structure>

각 workspace(서브디렉터리)는 이 구조를 따른다:

```text
workspace/
  README.md    # 프로젝트 개요 + docs/ 인덱스 테이블
  AGENTS.md    # 프로젝트별 agent 컨텍스트
  CLAUDE.md    # AGENTS.md delegation
  docs/        # 상세 문서 (주제별 1파일)
```

이 구조의 핵심은 `docs/` 디렉터리다. 주제별로 파일을 분리하면(single responsibility) 여러 agent가 서로 다른 문서를 동시에 작성할 수 있다. 파일명은 lowercase, hyphen 구분(`concepts.md`, `docker-local-lab.md`), 각 파일은 H1 제목으로 시작하고 이후 H2 섹션으로 구성한다.

**워크스페이스 간 연관관계** — workspace의 AGENTS.md에는 frontmatter `paths`로 연관 워크스페이스를 명시한다. 참조 방향은 일방향이다 — 새 workspace가 기존 workspace를 참조한다. 기존 workspace를 수정할 필요 없다. 디렉터리 전체가 관련이면 `디렉터리/`를, 특정 파일만 관련이면 파일 경로를 적는다. 경로는 portfolio 루트 기준 상대경로다.

```yaml
---
paths:
  - computer_science/dangerous_cache/
---
```

README.md는 프로젝트 개요와 docs/ 링크 테이블을 담는다:

```markdown
# 프로젝트 제목

## 개요

프로젝트에 대한 간단한 설명

## 문서 목차

| 문서 | 설명 |
|------|------|
| [concepts.md](./docs/concepts.md) | 핵심 개념 정리 |
| [architecture.md](./docs/architecture.md) | 아키텍처 설명 |
```

루트 `README.md`는 포트폴리오 전체 인덱스(번호 목록)를 관리한다. 새 workspace를 추가하면 여기에도 항목을 추가한다.

</doc-structure>

<skills>

작업에 맞는 skill이 있으면 사용한다 — skill은 일관된 품질과 형식을 보장하기 때문이다.

| 작업 | Skill |
|------|-------|
| 기술 문서 / 블로그 글 작성 | `writing-with-akbunstyle` |
| 아키텍처 시각화 프롬프트 | `arch-viz-prompter` |
| PR 생성 | `create-github-pr` |
| 커밋 메시지 | `suggest-git-commit-message` |
| 문서 리뷰/교정 | `docs_reviewer` |

한국어 문서는 `writing-with-akbunstyle`로 작성하고, PR은 `create-github-pr`로 만들고, 문서를 커밋하기 전에 `docs_reviewer`로 품질을 확인한다 — 이 세 가지가 품질 게이트 역할을 한다. 각 workspace의 AGENTS.md에는 `## Used Skills` 섹션을 넣어서 어떤 skill을 쓰는지 명시한다.

</skills>

<code-rules>

코드 작성 규칙은 `.claude/rules/`에 정의되어 있다. claude code이 아닌 codex, gemini CLI등은 .claude/rules/를 로드한다.

- Kubernetes manifests: `.claude/rules/kubernetes.md`
- Markdown: `.claude/rules/markdown.md`
- Terraform HCL: `.claude/rules/terraform.md`

프로젝트별 추가 제약이 있을 수 있으니, 해당 workspace의 AGENTS.md도 확인한다.

</code-rules>
