# Agent Guide

## 프로젝트 구조

- [디렉터리 구조](./docs/structure.md)
- [작업 이력](./docs/changelog.md)

## requirements

만약 너가 claude.ai에 실행한 claude code라면 plugin을 설치하여 skills을 확인하고 설치한다. claude.ai가 아닌 로컬이라면 plugin이 설치되어 있다고 가정한다.

```bash
/plugin marketplace add choisungwook/akbun-aitools
/plugin install akbun-writing@akbun-aitools
```

## workflow

- 작업 히스토리 관리는 [`.claude/rules/workflow.md`](./.claude/rules/workflow.md)에 정의되어 있음
- 작성한 문서는 `akbun-writing:writing-with-akbunstyle` skills로 작성한다. 그리고 `akbun-writing:akbun-style-reviewer` agent로 문서를 검증받고 검증될때까지 문서를 수정한다. 검증이 끝난 문서는 `akbun-writing:akbun-docs-reviewer` skills 문서 내용을 수정한다.

## 코드 규칙

- 코드 작성 규칙은 `.claude/rules/`에 정의되어 있다.
- 가독성이 최우선이다. 성능 최적화보다 읽기 쉬운 코드를 우선한다. 3개월 후에 다시 봐도 바로 이해할 수 있어야 한다.
