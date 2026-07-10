# Agent Guide

이 파일(AGENTS.md)이 모든 agent의 단일 진입점이다. Claude Code는 `CLAUDE.md`가 이 파일을 가리킨다.

## 저장소의 목적

- 핸즈온 실습과 공부 노트 저장소다. 문서는 핸즈온 절차와 그에 필요한 이론만 담는다. 원리를 이해하고 재현할 수 있으면 충분하다. 글쓰기 태도는 [.claude/rules/philosophy.md](./.claude/rules/philosophy.md)를 따른다.
- 이 저장소는 공개되므로 코드와 문서에 문맥상 민감한 정보를 쓰지 않는다. 실습은 기술 자체로 성립하도록 쓴다.

## 코드 규칙

코드 작성 규칙은 `.claude/rules/`의 파일을 따른다. 작업 대상에 맞는 파일을 찾아 적용한다.

| 파일 | 적용 대상 |
| --- | --- |
| [`.claude/rules/workflow.md`](./.claude/rules/workflow.md) | Worktree → Commit → PR 작업 흐름 |
| [`.claude/rules/philosophy.md`](./.claude/rules/philosophy.md) | 글쓰기 철학 |
| [`.claude/rules/markdown.md`](./.claude/rules/markdown.md) | Markdown 헤더·코드블록 규칙 |
| [`.claude/rules/kubernetes.md`](./.claude/rules/kubernetes.md) | Kubernetes manifest |
| [`.claude/rules/terraform.md`](./.claude/rules/terraform.md) | Terraform HCL |
| [`.claude/rules/python.md`](./.claude/rules/python.md) | Python |
| [`.claude/rules/knowledge.md`](./.claude/rules/knowledge.md) | knowledge/ 지식 번들 기록 |

가독성이 최우선이다. 성능 최적화보다 3개월 후에 다시 봐도 바로 이해되는 코드를 쓴다.

## 문서 작성 규칙

문서의 목적은 핸즈온과 그에 관련된 이론 정리다. 길게 쓰지 않는다.

분량:

- A4 1장을 목표로 한다. 넘치면 최대 A4 2장까지만 허용한다.

내용:

- 제3자가 읽었을 때 의미 없는 컨텍스트를 쓰지 않는다. 작업 당시의 대화 맥락, agent의 작업 과정, "요청에 따라 ~했다" 같은 문장을 금지한다.
- 결론을 먼저 3문장 이내로 쓰고, 필요한 경우에만 세부 설명을 붙인다.
- 불필요한 인사, 감탄, 요약 반복, 장황한 배경 설명을 생략한다.
- 이미 쓴 내용을 반복하지 않는다.
- 표, 목록, 코드가 산문보다 간결하면 그것을 우선 사용한다.
- 사용자가 "자세히", "비교", "근거", "예시"를 요청하지 않으면 긴 설명을 쓰지 않는다.
- 추측이 필요한 경우 짧게 가정만 밝히고 진행한다.

구조:

- 새 예제 디렉터리의 `README.md`는 문서 링크 허브로만 쓴다. 긴 설명과 실습 절차는 `docs/` 디렉터리에 시나리오별 Markdown으로 분리한다.
- 새 핸즈온을 추가하면 루트 `README.md` 목차에 `{번호}. {주제} ({작성날짜}) - [링크](...)` 형식으로 추가한다. 날짜 예: `26.6.21`

## 문서 작성 도구

문서 작성과 검토에 `akbun-*` plugin을 사용한다.

Claude Code에서 plugin 설치:

```bash
/plugin marketplace add choisungwook/akbun-aitools
/plugin install akbun-writing@akbun-aitools
```

문서 작성 흐름:

1. `akbun-writing` skill로 초안을 쓴다.
2. `akbun-style-reviewer` agent로 스타일을 검증하고 통과할 때까지 수정한다.
3. `akbun-docs-reviewer` skill로 문장과 구조를 다듬는다.

## 지식 축적

[knowledge/](./knowledge/index.md)는 OKF(Open Knowledge Format) 기반 지식 번들이다. agent는 작업에서 얻은 의사결정, 반복 절차, 도메인 통찰을 여기에 기록해 다음 작업의 컨텍스트로 재사용한다. 기록 기준과 형식은 [.claude/rules/knowledge.md](./.claude/rules/knowledge.md)를 따른다.

## 작업 흐름

Worktree에서 작업하고 commit 1개로 PR을 만든다. PR을 만들 때 기록용 GitHub Issue를 함께 만들어 연결한다.

**git commit, push, PR 생성, Issue 생성은 사용자가 명시적으로 지시할 때만 실행한다.** agent는 구현과 검증까지만 하고 멈춘 뒤 변경 요약을 보고한다. plan 승인이나 이 문서의 표준 흐름은 실행 허가가 아니다. 자세한 규칙은 [.claude/rules/workflow.md](./.claude/rules/workflow.md)를 따른다.
