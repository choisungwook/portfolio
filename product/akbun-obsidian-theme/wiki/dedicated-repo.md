# Dedicated repository bootstrap

How to have an AI agent build `choisungwook/akbun-obsidian-theme` from scratch. The community directory needs `manifest.json` at the repository root, so that repository is the one users and the directory see. Everything the agent must keep writing on every task (llm wiki, ADR, knowledge) is enforced by the AGENTS.md below, not by memory.

## Repository shape Obsidian expects

| Path | Why |
| --- | --- |
| `manifest.json` | Read from the default branch root by the community directory. `version` equals the release tag |
| `theme.css` | Attached to the release together with `manifest.json` |
| `README.md` | Excerpt shown on the listing page |
| `LICENSE` | Required for submission |
| `screenshot.png` | 512 by 288, required for submission |

Everything else is for the agent: `AGENTS.md`, `CLAUDE.md` (one line pointing at AGENTS.md), `knowledge/` copied from this repository's `templates/knowledge/`, `wiki/`, `adr/`, `test/`, `package.json`, `.github/workflows/release.yml`.

## Step 1: create the empty repository

Public, no template, default branch `master`. Add nothing else; the agent fills it.

## Step 2: seed the rules

Commit `AGENTS.md` and `CLAUDE.md` before the first agent task so the first task already runs under the rules.

`CLAUDE.md`:

```markdown
# Claude Code Guide

이 저장소의 모든 규칙은 [AGENTS.md](./AGENTS.md)를 따른다.
```

`AGENTS.md`:

```markdown
# Agent Guide

## 저장소의 목적

- Obsidian community 테마 Akbun의 단일 저장소다. Obsidian은 repo root의 manifest.json과 version tag release의 theme.css를 읽으므로 두 파일은 항상 root에 둔다.
- 공개 저장소다. 코드와 문서에 민감한 정보를 쓰지 않는다.

## MANDATORY: 작업 시작 전에 읽는 것

파일을 고치기 전에 아래를 순서대로 읽는다. 읽지 않고 고친 코드는 이미 버려진 방법을 다시 고른다.

1. knowledge/index.md. 이번 작업에 걸리는 concept가 있으면 그 파일까지 읽는다.
2. wiki/index.md와 그 안에서 이번 작업이 닿는 문서.
3. adr/index.md. 이번 작업이 뒤집는 결정이 있으면 새 ADR로 supersede하고 옛 ADR은 지우지 않는다.

이전 세션에서 읽은 것은 이번 세션에서 읽은 것이 아니다.

## MANDATORY: 작업 끝에 남기는 것

코드가 바뀐 commit에는 아래가 같이 들어간다. 나중에 몰아서 하지 않는다. 몰아서 하려던 세션은 끊겨서 아무것도 남기지 못한다.

| 남기는 것 | 언제 | 어디에 |
| --- | --- | --- |
| llm wiki | 구조, 흐름, 실행 방법, 주의점이 바뀌었을 때 | wiki/architecture.md, wiki/development.md. index.md 표 갱신 |
| ADR | 두 가지 이상의 방법 중 하나를 골랐을 때 | adr/YYYY-MM-<topic>.md. Decision과 Reason 섹션. adr/index.md에 한 줄 추가 |
| knowledge | 앞으로의 작업에도 유효한 결정, 두 번 이상 반복된 절차, 외부 자료 사본 | knowledge/decisions, playbooks, references. 각 index.md와 knowledge/log.md 갱신 |
| 버전 | theme.css나 manifest.json이 바뀌었을 때 | manifest.json과 package.json의 version을 같이 올린다. 수정은 patch, 기능은 minor |

쓰지 않는 것: 대화 맥락, agent의 작업 과정, "요청에 따라 ~했다" 같은 문장, 코드와 git history가 이미 말하는 것.

## 문서 형식

- wiki, adr, README, 코드 주석은 간결한 영어로 쓴다. knowledge concept는 저장소 루트 규칙을 따른다.
- 최상단 제목만 H1, 이후는 H2부터. 코드블록 바로 위에 그 코드가 무엇인지 한 줄 적는다.
- 개조식으로 쓴다. 한 항목에 한 가지만 담는다.
- knowledge concept 규칙: YAML frontmatter에 type(Decision, Playbook, Topic, Reference), title, description, tags, timestamp. Decision은 "## 결정"과 "## 이유". 파일명은 소문자 하이픈, decision은 YYYY-MM-<주제>.md. 분량은 A4 반 장 이내.

## 테마 규칙

- theme.css 한 파일이다. @import와 원격 자산을 쓰지 않는다.
- 사용자가 바꿀 색은 --akbun-* 변수 하나로 두고, 같은 id로 Style Settings 블록에 선언한다. 블록의 기본값과 CSS 기본값은 같아야 하며 테스트가 이를 검사한다.
- 파일 탐색기는 한 가지 muted 색이다. accent는 현재 파일에만 나타난다.
- 팔레트는 Catppuccin Latte(light)와 Mocha(dark)다. 새 색은 팔레트 안에서 고른다.
- 테스트는 Obsidian 없이 node만으로 돈다. npm test가 통과해야 commit한다.

## 릴리스

- master push에서 workflow가 manifest.json의 version을 읽고, 같은 이름의 tag가 없으면 tag와 release를 만들고 manifest.json과 theme.css를 첨부한다.
- 버전을 안 올리면 release가 조용히 건너뛴다. workspace를 바꾼 commit은 버전을 올린다.

## 작업 흐름

- branch는 <type>/<short-description>. master에 직접 commit하지 않는다.
- commit message는 영어. PR body는 한글 개조식으로, 어려웠던 점과 감수하는 리스크만 쓴다.
- 단계가 3개를 넘는 작업은 .claude/work/<branch>.md에 실행 계획과 체크박스를 두고, 단계를 끝낸 그 자리에서 갱신한다. PR 직전에 지운다.
```

## Step 3: the first task prompt

Give the agent this prompt in a session opened on the new repository. It references files in this repository by path, so include the branch or commit that has them.

```text
choisungwook/akbun-obsidian-theme를 처음부터 만든다. AGENTS.md를 먼저 읽고 그 규칙대로 작업한다.

만들 것: Obsidian community 테마 Akbun.
- Catppuccin Latte(light), Mocha(dark) 팔레트. AnuPpuccin과 같은 계열.
- 왼쪽 파일 탐색기는 색 없이 한 가지 muted 색. 현재 선택된 파일만 accent 배경, 굵은 글씨, 왼쪽 marker.
- 헤더 H1~H6, bold, italic, link, highlight, accent, 현재 파일 색은 --akbun-* 변수 하나로 조절. 같은 id로 Style Settings 블록을 선언.

출발점: choisungwook/portfolio 저장소의 product/akbun-obsidian-theme/ (branch claude/obsidian-theme-creation-8r1ebx).
- workspace/theme.css, manifest.json, package.json, test/theme.test.js, LICENSE, README.md를 이 저장소 root로 가져온다. 경로가 root로 바뀌므로 테스트의 경로와 package.json의 test script를 맞춘다.
- wiki/와 adr/도 가져오되, 모노repo와 mirror에 대한 내용은 이 저장소가 소스라는 사실에 맞게 다시 쓴다.
- knowledge/는 portfolio 루트의 templates/knowledge/를 통째로 복사해서 시작한다. templates 안의 concept는 없으므로 index.md, log.md, 각 하위 index.md, references/okf-spec-0.1.md만 온다.

이 저장소에서 새로 만들 것:
- .github/workflows/release.yml: pull_request는 npm test. master push는 manifest.json의 version을 읽어 같은 tag가 없을 때만 tag와 release를 만들고 manifest.json, theme.css를 첨부. action은 최신 stable major 확인 후 사용.
- .gitignore: node_modules/.
- README.md: 테마 설명, 설치 방법, 색 바꾸는 방법. community 목록에 발췌되므로 첫 문단이 테마를 설명해야 함.

남기는 것 (AGENTS.md의 MANDATORY):
- wiki/index.md, architecture.md, development.md.
- adr/index.md와 결정마다 파일 하나. 최소한 "소스가 이 저장소인 이유", "Catppuccin과 색 없는 탐색기", "변수와 Style Settings"의 세 개.
- knowledge/decisions/에 앞으로도 유효한 결정을 기록하고 index.md, log.md 갱신.

끝내는 조건: npm test 통과, workflow YAML 유효, manifest.json version 0.1.0, 위 문서가 모두 있음. 스크린샷은 실제 Obsidian 화면이 필요하므로 만들지 않고 development.md에 남은 일로 적는다.
```

## Step 4: after the first task

1. Install the theme from the repository into a vault and check light and dark mode. Fix selectors in a follow-up task; the agent records what changed in wiki and ADR by the rules above.
2. Take the 512 by 288 screenshot in Obsidian and commit it as `screenshot.png`.
3. Push a version tag or bump `manifest.json` on master to get the first release.
4. Submit to the community directory: fork obsidianmd/obsidian-releases, add an entry to `community-css-themes.json` with `repo: choisungwook/akbun-obsidian-theme`, `screenshot: screenshot.png`, `modes: [dark, light]`, and open the pull request.

## What changes in this repository

Once the dedicated repository is the source, the `workspace/` here and the mirror step in the release workflow are redundant. Reduce this product to a README that links to the dedicated repository, and drop the workflow, in a follow-up pull request.
