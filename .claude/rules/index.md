# 규칙 인덱스

이 파일과 같은 디렉터리의 규칙은 매 세션 자동으로 주입된다. 나머지 규칙은 [.claude/rule-details/](../rule-details/)에 있고 자동으로 주입되지 않는다. 작업이 아래 표의 영역에 닿을 때 그 행의 파일을 읽는다. 한 작업이 여러 행에 걸리면 걸린 파일을 전부 읽는다.

## 조건부 규칙

| 파일 | 읽는 시점 |
|---|---|
| [github-tools.md](../rule-details/github-tools.md) | Issue, PR, 리뷰, merge 등 GitHub를 건드릴 때 |
| [product.md](../rule-details/product.md) | `product/` 아래 파일을 만들거나 고칠 때 |
| [tauri.md](../rule-details/tauri.md) | `src-tauri/`가 있는 workspace를 건드릴 때, 새 데스크톱 앱의 스택을 정할 때 |
| [electron.md](../rule-details/electron.md) | Electron workspace(`src/main/`, preload)를 건드릴 때 |
| [terraform.md](../rule-details/terraform.md) | `.tf` 파일을 만들거나 고칠 때 |
| [kubernetes.md](../rule-details/kubernetes.md) | `manifests/` 아래 YAML을 만들거나 고칠 때 |
| [python.md](../rule-details/python.md) | `.py` 파일을 만들거나 고칠 때 |

## workspace 지식

이미 있는 workspace를 고칠 때 그 workspace의 `knowledge/index.md`를 읽는다. 세부는 [knowledge.md](knowledge.md)의 "읽는 시점"에 있다.

## 항상 주입되는 규칙

| 파일 | 대상 |
|---|---|
| [philosophy.md](philosophy.md) | 글쓰기 철학. 모든 문서의 상위 규칙 |
| [markdown.md](markdown.md) | Markdown 헤더와 코드블록 |
| [knowledge.md](knowledge.md) | `knowledge/` 지식 번들 기록 |
| [workflow.md](workflow.md) | 작업 상태 파일, Issue와 PR, GitHub Actions |
