---
description: 아이디어, 목표, 버그를 듣고 기록용 Issue로 만든다. 불명확한 결정은 인터뷰로 확정하고, 큰 작업은 실행 순서 번호를 붙인 여러 Issue로 쪼갠다
argument-hint: [아이디어, 목표, 버그 설명]
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
---

사용자가 말한 내용(`$ARGUMENTS`, 없으면 대화 맥락)을 듣고 판단해 기록용 Issue를 만든다. PR은 만들지 않는다.

## 순서

1. 입력에서 작업 유형과 규모를 판단한다. 새 아이디어, 기능 목표, 버그 수정 중 무엇인지, 저장소의 어느 부분에 관한 것인지, Issue 하나로 충분한지 여러 개로 쪼갤지 정한다. 모호하면 저장소를 탐색해 맥락을 보강한다.
2. 탐색으로 답이 안 나오는 결정은 사용자와 인터뷰해 확정한다. 아래 인터뷰 규칙을 따른다.
3. root issue를 정한다. `product/<이름>`에 관한 것이면 그 product, `.claude`나 `.github`면 저장소 규칙과 도구, 나머지는 핸즈온이다. `gh issue list --label root --state open`으로 찾고 없으면 만든다. 디렉터리가 아직 없는 새 product도 root issue를 먼저 만들고, 골격 생성은 1번 Issue의 Goal에 넣는다.
4. 기록용 Issue를 만든다. 아래 Issue 구성을 따른다.
5. 각 Issue를 root issue 하위로 건다. sub-issue API 호출 형식은 [.claude/rules/workflow.md](../rules/workflow.md)에 있다.
6. root issue와 새 Issue를 project에 담는다. scope 부족이나 gh 부재로 실패하면 사용자가 실행할 명령을 안내하고 넘어간다.
7. Issue에 작업 유형 label(feat, fix, docs 등)과 기술 label을 함께 붙인다.

## 인터뷰 규칙

- 사용자만 답할 수 있는 것을 묻는다. 제품 이름, 기술 방향, 파일 형식, 기본값, Issue 묶음 구성이 여기에 든다. 저장소 탐색이나 웹 검색으로 확인되는 사실은 묻지 않는다.
- 선택지마다 트레이드오프를 한 줄로 붙이고 추천안을 표시한다.
- 사용자가 잘 모르는 기술 영역이면 질문 안에서 배경 개념부터 짧게 풀고 묻는다.
- 인터뷰에서 내린 결정은 해당 Issue의 ADR에 기록한다.

## Issue 구성

- [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)를 따라 Goal을 채운다. 결정이 있으면 ADR을 채우고, 없으면 ADR 섹션을 헤더째 지운다.
- 새 product나 큰 기능은 구현 관점의 큰 묶음으로 나눠 Issue 여러 개를 만들고, 제목 앞에 실행 순서 번호를 붙인다. 예: 1. 프로젝트 골격과 재생 코어. 그룹에 이미 번호 붙은 하위 issue가 있으면 번호를 이어 간다.
- 실행 순서는 리스크가 가장 큰 검증이 앞 번호에 오도록 정하고, 그 검증을 해당 Issue의 Goal에 명시한다.
- 사용자가 잘 모르는 기술 영역이면 Goal과 ADR 아래에 배경 지식 섹션을 추가한다. 그 Issue를 구현할 때 필요한 용어와 동작 원리를 개조식으로 풀고, 어디가 어려운지 지목한다.

## 작성 규칙

- Issue body는 한글 개조식으로 쓴다. 종결어미(-다, -한다, -했다)를 쓰지 않고 명사나 -음, -함으로 끝낸다.
- Goal은 번호 리스트 3개 이내로 쪼갠다. 근거는 마크다운 리스트 최대 1개다. backtick을 쓰지 않는다.
- 벤치마킹한 제품의 이름을 쓰지 않고 기능 서술로 대체한다. 특정 제품에 묶인 파일 형식 이름도 같은 이유로 피한다.
- 사용자의 말을 그대로 옮기지 않고 목표 형태로 정리한다. 판단이 들어간 부분은 Issue 생성 후 사용자에게 요약해 알린다.
- Issue body에 claude session 링크를 넣지 않는다.
- 나머지는 [.claude/rules/workflow.md](../rules/workflow.md)를 따른다.

## 주의

- 이 command를 호출한 것이 Issue 생성에 대한 명시적 지시다. [.claude/rules/workflow.md](../rules/workflow.md)의 실행 승인 규칙은 이 범위 안에서 충족된다.
- commit, push, PR 생성은 하지 않는다. 그것은 /repo-pr-create의 일이다.
- gh CLI가 없는 환경(원격 세션)에서는 GitHub MCP 도구로 대체한다. sub-issue 등록에는 issue number가 아니라 생성 응답의 id를 넘긴다.
