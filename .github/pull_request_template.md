<!--
이 파일이 PR body 형식의 기준이다. slash command와 rules는 이 파일을 참조한다.
여기는 형식만 정한다. 문체와 label 같은 공통 작성 규칙은 .claude/rules/workflow.md를 따른다.

아래 H1 두 개가 PR body의 전체 구조다. PR body는 .claude/rules/markdown.md의 헤더 규칙 대상이 아니므로 H1을 그대로 쓴다.
항목은 요약 한 줄과 그 아래 근거 항목들로 구성한다.
앞으로의 작업에도 영향을 주는 항목은 요약 줄 앞에 **[Important]** 를 붙이고 섹션 위로 올린다.
-->

# Decisions

<!--
작업 중 내린 의사결정을 쓴다. 요약 줄은 무엇을 정했는지, 아래 항목은 왜 그렇게 정했는지다.

예시:
**[Important]** We hide icons with two spacer status items made of spaces.
- macOS has no hide API. Widening one item is the only way to push others off screen.
- Electron only exposes setTitle. So we express width as long runs of spaces.

We let macOS own which section an icon belongs to.
- Icon order is system state. Only a Command drag changes it.
-->

# Implementation

<!--
실제로 구현한 것과 검증 결과를 쓴다. 수치와 측정값이 있으면 항목으로 남긴다.

예시:
**[Important]** The item scan runs one short call per process, in a pool of eight.
- The process list is fetched once, then reused.
- A full scan takes about 10 seconds and finds all 19 real items.
-->

<!-- 아래에 기록용 issue를 링크한다. 예: Issue #123 -->
Issue #
