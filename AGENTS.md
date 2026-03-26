# Portfolio Repository — Agent Workflow Guide

<purpose>
이 레포는 공부한 것을 기록하는 곳이다.
모든 문서는 "3개월 후의 내가 다시 봤을 때 이해할 수 있는가?"를 기준으로 쓴다.
공식 문서를 복붙하는 곳이 아니라, 내가 이해한 것을 내 말로 정리하는 곳이다.
</purpose>

<quality>
좋은 문서의 조건 (우선순위 순):

1. 내 말로 쓰여 있다 — 공식 문서 문체가 아니라, 내가 이해한 방식으로 설명한다
2. "왜"가 먼저 나온다 — 이걸 왜 공부했는지, 왜 위험한지, 왜 이 방식인지. 동기 없는 지식은 3개월 후에 의미를 잃는다
3. 재현할 수 있다 — 핸즈온 코드가 있으면 동작해야 한다. 설명만으로는 나중에 확인이 안 된다
4. 삽질 과정이 있으면 보너스 — 뭘 시도했고, 뭐가 안 됐고, 어떻게 해결했는지. 회고에 쓸 수 있다

나쁜 문서:

- 공식 문서를 번역하듯 옮겨놓은 것 — 원본을 읽는 게 낫다
- "~할 수 있다"로 끝나는 기능 나열 — 왜 필요한지, 언제 쓰는지가 없다
- 코드만 있고 설명이 없는 것 — 3개월 후의 나는 이 코드가 뭘 하는지 모른다
</quality>

<workflow>

모든 작업은 이 흐름을 따른다. Issue를 먼저 만드는 이유는 "뭘 왜 했는지"를 3개월 후에도 추적할 수 있게 하기 위해서다. 채팅은 사라지지만 Issue는 남는다.

<basic-flow>
1. Issue 생성 — 작업의 시작점. 뭘 할 건지 먼저 기록한다.
2. Worktree 생성 — 격리된 환경에서 작업한다.
3. 작업 수행 — 코드, 문서 등 실제 작업.
4. Commit — Conventional Commits 형식(`feat(scope): subject`)으로 커밋한다.
5. Push — 작업이 끝나면 remote에 push한다.
6. PR 생성 — PR body에 `Closes #<number>`를 넣어서 Issue와 연결한다. target branch는 `master`다.

Review, Merge, Worktree 정리는 사용자가 직접 한다.
</basic-flow>

<multi-agent>
핵심 아이디어는 **생성과 평가를 분리**하는 것이다. 모델은 자기 결과물을 스스로 평가하면 관대해지는 경향이 있다. 별도의 평가자가 회의적인 시각으로 검토하면 품질이 올라간다.

이 패턴을 GitHub Issue로 구현하며, `.claude/agents/`에 정의된 에이전트 파일을 활용한다.

| 에이전트 | 파일 |
|----------|------|
| 기획자(Planner) | `.claude/agents/planner.md` |
| 생성자(Generator) | `.claude/agents/generator.md` |
| 평가자(Evaluator) | `.claude/agents/evaluator.md` |

각 에이전트의 역할과 상세 동작은 해당 파일에 정의되어 있다. Claude Code의 Agent tool이나 subagent로 호출한다. Sub-issue가 여러 개면 생성자를 병렬로 띄워 각각 다른 sub-issue를 처리할 수 있다.

에이전트 간 관계는 **파이프라인**이지 대화가 아니다. 기획자는 초반에 한 번 실행되고, 이후 반복 루프는 생성자-평가자 사이에서 돌아간다.

```
기획자 ──(사양)──▶ 생성자 ◀──(피드백)──▶ 평가자
  │                  │                      │
  │ 1회 실행         │ 반복 루프             │ 반복 루프
  ▼                  ▼                      ▼
Issue body 작성    코드/문서 구현         결과물 채점
  + Sub-issue 분해   + comment로 진행 기록   + comment로 피드백
```

기획자가 한 번만 실행하는 이유: 기획자 없이 생성자에게 짧은 프롬프트를 바로 주면 구체화 없이 바로 빌드를 시작해서 범위가 축소된다. 기획자가 먼저 사양을 잡아주면 생성자가 더 풍부한 결과물을 만든다. 사양이 나온 후에는 기획자가 개입할 필요 없다.

생성자-평가자가 반복하는 이유: 별도의 평가자가 구체적인 기준으로 채점하고, 그 피드백을 받아 생성자가 수정하는 루프가 자기 평가보다 품질이 높다. 평가자가 모든 기준에서 PASS를 줄 때까지 반복한다.

GitHub Issue에서 Parent Issue = 기획 사양, Sub-Issue = 작업 단위, Comment = 진행 기록 + 평가 피드백으로 사용한다.
</multi-agent>

<simplification>
이 워크플로우의 모든 구성 요소는 "모델이 스스로 못하는 것"에 대한 가정을 담고 있다. 모델이 발전하면 이 가정은 빠르게 낡아진다. **가능한 가장 단순한 구성으로 시작하고, 필요할 때만 복잡성을 높인다.**

에이전트가 많을수록 토큰 비용과 지연 시간이 증가한다. 구성 요소를 하나씩 빼면서 결과에 미치는 영향을 확인한다 — 한 번에 많이 바꾸면 뭐가 핵심이었는지 파악할 수 없다.

| 작업 규모 | 기준 | 예시 | 권장 구성 |
|-----------|------|------|-----------|
| 소형 | 파일 1-2개, sub-issue 없음, 예상 커밋 1-3개 | 문서 1개 작성, 버그 수정, 설정 변경 | 생성자만 |
| 중형 | 파일 3-5개, sub-issue 2-3개, 예상 커밋 4-10개 | 핸즈온 실습 1개, 새 workspace 구성 | 기획자 + 생성자 |
| 대형 | 파일 6개 이상, sub-issue 4개 이상, 예상 커밋 10개 이상 | 멀티 서비스 실습, 대규모 리팩토링 | 기획자 + 생성자 + 평가자 |

판단이 애매하면 한 단계 낮은 구성으로 시작한다. 작업 중 범위가 커지면 그때 에이전트를 추가한다.
</simplification>

<practical-example>
핸즈온 실습 제작의 흐름:

1. **기획 (Parent Issue)**:

```
Issue #10: "CDN 캐시 위험성 핸즈온"

## 목표
CDN 캐시 키 설정에 따른 개인정보 노출 문제를 재현하고 이해한다.

## 작업 범위
- 개념 문서, Docker 재현 환경, 실습 가이드
- 작업 디렉터리: computer_science/dangerous_cache/

## 제약 조건
- Docker Compose로 로컬에서 재현 가능할 것
```

2. **분해 (Sub-Issue)**:

```
#11: "개념과 위험성 문서 작성" (Parent: #10)
#12: "Docker 재현 환경 구성" (Parent: #10)
#13: "실습 가이드 작성" (Parent: #10)
```

3. **생성 + 평가 루프 (Comment)**:

```
#11 comment (생성자):
"초안 작성 완료. commit: abc1234"

#11 comment (평가자):
"동기 설명: NEEDS_WORK — '왜 위험한지'가 2번째 섹션에서야 나온다.
도입부에 핵심 위험을 먼저 보여줄 것"

#11 comment (생성자):
"피드백 반영. commit: def5678. 도입부에 요약 섹션 추가"
```

4. **핸드오프 (에이전트 교체 시)**:

```
#12 comment (핸드오프):
## 현재 상태
- Docker Compose 파일 작성 완료, 아직 테스트 안 됨

## 다음 단계
- docker compose up 실행 테스트
- 캐시 오염 재현 확인
```
</practical-example>

</workflow>

<issue-management>

Issue는 이 레포의 작업 추적 시스템이다. 작업을 시작하기 전에 기존 이슈를 확인하고, 없으면 새로 만든다.

```bash
gh issue list --state open
gh issue create --title "작업 제목" --body "작업 내용" --label "feat"
```

큰 작업은 sub-issue로 분할하면 여러 agent가 병렬로 처리할 수 있다.

```bash
gh issue create --title "하위 작업" --body "Parent: #<parent-number>"
```

Issue body에는 **무엇을 왜 하는지**(작업 디렉터리 포함)와 **TODO 체크박스**를 담는다. 처음부터 완벽할 필요 없다 — 작업하면서 추가하거나 수정한다. 파일/디렉터리 목록을 미리 설계하지 않는다 — 범위는 TODO에서 자연스럽게 드러난다.

Label은 두 종류를 함께 붙인다:
- 작업 유형: `docs`, `feat`, `fix`, `refactor`, `hands-on`
- 기술 태그: `kubernetes`, `aws`, `terraform`, `cilium`, `cache` 등

</issue-management>

<commits-and-prs>

Commit 메시지는 Conventional Commits 형식(`feat(scope): subject`)을 따른다. pre-commit hook이 실패하면 문제를 고친 뒤 새 commit을 만든다 — amend는 이력이 사라지므로 하지 않는다.

PR body에 `Closes #<number>`를 넣어서 Issue와 연결하고, target branch는 `master`다. PR description에 담기엔 긴 내용은 `docs/` 디렉터리에 파일로 작성하고, issue에서 링크한다.

</commits-and-prs>

<git-worktree>

branch checkout 대신 git worktree를 사용한다. 여러 agent가 동시에 작업할 때 branch switching이 충돌을 일으키지만, worktree는 각각 독립된 working directory를 가지므로 이 문제가 없다. `.gitignore`에 `worktree/`가 이미 등록되어 있다.

```bash
git worktree add ../portfolio-<topic> -b <branch-name>
git worktree list
git worktree remove ../portfolio-<topic>
```

Branch 이름은 `<type>/<short-description>` 패턴을 따른다. 예: `feat/cloudfront-cache-demo`, `docs/cilium-networkpolicy`, `fix/readme-links`. type은 `feat`, `docs`, `fix`, `refactor`, `chore` 중 하나다. Claude Code가 자동 생성하는 `claude/...` 패턴도 괜찮다.

여러 agent가 동시에 작업할 때 핵심 원칙은 **파일 단위 분할**이다. 각 agent가 고유한 파일을 담당하고, 같은 파일을 두 agent가 동시에 수정하지 않는다.

```bash
gh issue list --state open
gh pr list --state open
```

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

`docs/` 디렉터리가 핵심이다. 주제별로 파일을 분리하면 여러 agent가 서로 다른 문서를 동시에 작성할 수 있다. 파일명은 lowercase, hyphen 구분(`concepts.md`, `docker-local-lab.md`), 각 파일은 H1 제목으로 시작하고 이후 H2 섹션으로 구성한다.

**워크스페이스 간 연관관계** — workspace의 AGENTS.md에는 frontmatter `paths`로 연관 워크스페이스를 명시한다. 참조 방향은 일방향이다 — 새 workspace가 기존 workspace를 참조한다. 경로는 portfolio 루트 기준 상대경로다.

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

작업에 맞는 skill이 있으면 사용한다 — skill은 일관된 품질과 형식을 보장한다.

| 작업 | Skill |
|------|-------|
| 기술 문서 / 블로그 글 작성 | `writing-with-akbunstyle` |
| 아키텍처 시각화 프롬프트 | `arch-viz-prompter` |
| 문서 리뷰/교정 | `docs_reviewer` |

한국어 문서는 `writing-with-akbunstyle`로 작성하고, 문서를 커밋하기 전에 `docs_reviewer`로 품질을 확인한다. 각 workspace의 AGENTS.md에는 `## Used Skills` 섹션을 넣어서 어떤 skill을 쓰는지 명시한다.

</skills>

<code-rules>

코드 작성 규칙은 `.claude/rules/`에 정의되어 있다. claude code이 아닌 codex, gemini CLI등은 .claude/rules/를 로드한다.

- Kubernetes manifests: `.claude/rules/kubernetes.md`
- Markdown: `.claude/rules/markdown.md`
- Terraform HCL: `.claude/rules/terraform.md`

프로젝트별 추가 제약이 있을 수 있으니, 해당 workspace의 AGENTS.md도 확인한다.

</code-rules>
