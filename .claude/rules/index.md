# 규칙 인덱스

이 파일과 같은 디렉터리의 규칙은 매 세션 자동으로 주입된다. 나머지 규칙은 [.claude/rule-details/](../rule-details/)에 있고 자동으로 주입되지 않는다. 그 규칙들은 작업이 해당 영역에 닿을 때 agent가 직접 읽어야 한다.

## MANDATORY: 조건부 규칙 로딩

**CRITICAL**: 아래 표의 "읽는 시점"에 해당하는 작업을 시작하기 전에, 그 행의 파일을 **반드시 읽는다**. 파일을 편집한 뒤에 읽는 것은 늦다.

- 규칙을 읽지 않고 한 작업은 그 자체로 결함이다. 규칙에 적힌 것은 대부분 이미 밟은 지뢰이므로, 읽지 않으면 같은 지뢰를 다시 밟는다.
- 한 작업이 여러 행에 걸리면 걸린 파일을 전부 읽는다.
- 기억으로 대신하지 않는다. 이전 세션에서 읽었다는 것은 이번 세션에서 읽은 것이 아니다.

| 파일 | 읽는 시점 |
|---|---|
| [github-tools.md](../rule-details/github-tools.md) | Issue, PR, 리뷰, merge 등 GitHub를 건드리기 전 |
| [product.md](../rule-details/product.md) | `product/` 아래 파일을 만들거나 고치기 전 |
| [tauri.md](../rule-details/tauri.md) | `src-tauri/`가 있는 workspace를 건드리기 전, 새 데스크톱 앱의 스택을 정할 때 |
| [electron.md](../rule-details/electron.md) | Electron workspace(`src/main/`, preload)를 건드리기 전 |
| [terraform.md](../rule-details/terraform.md) | `.tf` 파일을 만들거나 고치기 전 |
| [kubernetes.md](../rule-details/kubernetes.md) | `manifests/` 아래 YAML을 만들거나 고치기 전 |
| [python.md](../rule-details/python.md) | `.py` 파일을 만들거나 고치기 전 |

## MANDATORY: workspace 지식 로딩

**CRITICAL**: 이미 있는 workspace를 고치기 전에 그 workspace의 `knowledge/index.md`를 읽는다. 자세한 규칙은 [knowledge.md](knowledge.md)의 "읽는 시점"에 있다.

## 항상 주입되는 규칙

| 파일 | 대상 |
|---|---|
| [philosophy.md](philosophy.md) | 글쓰기 철학. 모든 문서의 상위 규칙 |
| [markdown.md](markdown.md) | Markdown 헤더와 코드블록 |
| [knowledge.md](knowledge.md) | `knowledge/` 지식 번들 기록 |
| [workflow.md](workflow.md) | 작업 상태 파일, Issue와 PR, GitHub Actions |
