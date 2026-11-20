# claude-mem 원리 핸즈온

코딩 에이전트의 세션 간 메모리를 claude-mem 구조대로 Python으로 재현(`minimem`)하고 실제 Claude Code 세션으로 확인하는 핸즈온이다.

@../../../AGENTS.md

## 변경 범위

- `minimem/`은 실습 대상 코드다. 바꾸면 `make test`와 문서의 실습 출력을 함께 갱신한다.
- `lab-template/`은 `make up`이 복사하는 원본이다. 실습 중 바뀐 파일은 `~/minimem-workspace/shop`에만 있다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
