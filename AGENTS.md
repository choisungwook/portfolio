# Agent Guide

이 디렉터리는 Claude Code와 Codex가 함께 사용한다. 두 도구 모두 이 파일(AGENTS.md)을 진입점으로 본다. 같은 룰을 따르되 도구별 자산은 분리되어 있다.

## 디렉터리의 의도

핸즈온 실습과 공부 노트가 모인 저장소다. 글의 퀄리티 자체가 목적이 아니다. 원리를 이해하고, 업무에서 잘 사용하고, 나와 남에게 잘 설명하는 것이 핵심이다. 이 의도는 [.claude/rules/philosophy.md](./.claude/rules/philosophy.md)에 더 자세히 적혀 있다.

## codex / Claude Code 공존 범위

두 도구가 어디까지 같은 자산을 공유하는지 한 표로 정리한다.

| 자산 | 공유 여부 | 비고 |
| --- | --- | --- |
| `AGENTS.md` (이 파일) | 양쪽 공유 | codex 자동 인식. Claude Code는 `CLAUDE.md` → `AGENTS.md` 포인터로 따라간다 |
| `.claude/rules/*.md` | 양쪽 공유 (명시 링크 경유) | 아래 "룰 인덱스"의 각 파일을 두 도구가 모두 펼쳐 본다 |
| `akbun-*` plugin | 양쪽 공유 | 같은 marketplace를 양쪽에 설치 |
| `.claude/hooks/*.sh` | 양쪽 공유 (스크립트 본체) | Claude Code는 `.claude/settings.json`, codex는 `.codex/config.toml`에서 같은 스크립트를 호출한다 |
| `.claude/settings.json`, `settings.local.json` | Claude Code 전용 | hook 등록 / 권한 |
| `.codex/config.toml` | codex 전용 | codex hook 등록 |

## requirements

문서 작성과 검토에 `akbun-*` plugin을 사용한다. 양쪽 도구 모두 같은 marketplace를 추가해서 설치한다.

Claude Code에서 marketplace 등록과 plugin 설치:

```bash
/plugin marketplace add choisungwook/akbun-aitools
/plugin install akbun-writing@akbun-aitools
```

codex는 동일 marketplace를 codex의 plugin 설치 방식으로 추가한다.

문서 작성 흐름:

- `akbun-writing` skill로 초안을 쓴다
- `akbun-style-reviewer` agent로 스타일을 검증하고 통과할 때까지 수정한다
- `akbun-docs-reviewer` skill로 문장과 구조를 다듬는다

예제와 핸즈온 문서 작성 기본값:

- 새 예제 디렉터리의 `README.md`는 문서 링크 허브로만 작성하고, 긴 설명과 절차는 넣지 않는다
- 실습 절차는 `docs/` 디렉터리에 시나리오별 Markdown 문서로 분리한다
- 새 핸즈온을 추가하면 루트 `README.md` 목차에 `{번호}. {주제} ({작성날짜}) - [링크](...)` 형식으로 추가한다. 날짜 예시는 `26.6.21`이다
- 문서 본문은 사용자가 별도로 말하지 않아도 `akbun-writing` skill 스타일을 따른다
- 서비스별 전환 위험 분석이나 리소스 생성 방침은 사용자가 요청한 경우에만 별도 문서로 작성한다

## 룰 인덱스

| 파일 | 내용 |
| --- | --- |
| [`.claude/rules/workflow.md`](./.claude/rules/workflow.md) | Issue → Worktree → Commit → PR 흐름. 검증 채점표와 회고 템플릿 포함 |
| [`.claude/rules/philosophy.md`](./.claude/rules/philosophy.md) | 글쓰기 철학과 나쁜 글의 기준 |
| [`.claude/rules/markdown.md`](./.claude/rules/markdown.md) | 헤더와 코드블록 규칙 |
| [`.claude/rules/kubernetes.md`](./.claude/rules/kubernetes.md) | Kubernetes manifest 디렉터리 구조와 YAML 규칙 |
| [`.claude/rules/terraform.md`](./.claude/rules/terraform.md) | AWS Terraform 스타일 |
| [`.claude/rules/python.md`](./.claude/rules/python.md) | python 코드 작성 스타일 |

## 코드 규칙

- 가독성이 최우선이다. 성능 최적화보다 읽기 쉬운 코드를 우선한다. 3개월 후에 다시 봐도 바로 이해할 수 있어야 한다.
- 세부 규칙은 위 룰 인덱스의 각 파일을 본다.
