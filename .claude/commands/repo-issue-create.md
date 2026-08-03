---
description: 아이디어, 목표, 버그를 듣고 기록용 Issue로 만든다. root issue의 하위로 걸고 템플릿을 따른다
argument-hint: [아이디어, 목표, 버그 설명]
allowed-tools: Bash, Read, Glob, Grep
---

사용자가 말한 내용(`$ARGUMENTS`, 없으면 대화 맥락)을 듣고 판단해 기록용 Issue를 만든다. PR은 만들지 않는다.

## 순서

1. 입력에서 작업 유형을 판단한다. 새 아이디어, 기능 목표, 버그 수정 중 무엇인지, 저장소의 어느 부분에 관한 것인지 정한다. 모호하면 저장소를 탐색해 맥락을 보강하고, 그래도 판단이 안 서면 사용자에게 묻는다.
2. root issue를 정한다. `product/<이름>`에 관한 것이면 그 product, `.claude`나 `.github`면 저장소 규칙과 도구, 나머지는 핸즈온이다. `gh issue list --label root --state open`으로 찾고 없으면 만든다.
3. 기록용 Issue를 만든다. [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)를 따라 Goal을 채운다. 입력에 이미 내린 의사결정이 있으면 ADR을 채우고, 없으면 ADR 섹션을 헤더째 지운다.
4. 3의 Issue를 2의 root issue 하위로 건다. sub-issue API 호출 형식은 [.claude/rules/workflow.md](../rules/workflow.md)에 있다.
5. root issue와 새 Issue를 project에 담는다. scope 부족으로 실패하면 안내만 하고 넘어간다.
6. Issue에 작업 유형 label(feat, fix, docs 등)과 기술 label을 함께 붙인다.

## 작성 규칙

- Issue body는 한글 개조식으로 쓴다. 종결어미(-다, -한다, -했다)를 쓰지 않고 명사나 -음, -함으로 끝낸다.
- Goal은 번호 리스트 3개 이내로 쪼갠다. 근거는 마크다운 리스트 최대 1개다. backtick을 쓰지 않는다.
- 사용자의 말을 그대로 옮기지 않고 목표 형태로 정리한다. 판단이 들어간 부분은 Issue 생성 후 사용자에게 요약해 알린다.
- Issue body에 claude session 링크를 넣지 않는다.
- 나머지는 [.claude/rules/workflow.md](../rules/workflow.md)를 따른다.

## 주의

- 이 command를 호출한 것이 Issue 생성에 대한 명시적 지시다. [.claude/rules/workflow.md](../rules/workflow.md)의 실행 승인 규칙은 이 범위 안에서 충족된다.
- commit, push, PR 생성은 하지 않는다. 그것은 /repo-pr-create의 일이다.
