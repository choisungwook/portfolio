---
type: Decision
title: Team wiki search is trigram FTS plus link expansion, behind a WikiSearch interface
description: No embedding model; trigram FTS fixes Korean substring recall, [[links]] add one hop, and the wiki is mirrored to files so graphify can index it.
tags: [team, wiki, search]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T12:00:00Z }
sources:
  - id: graphify
    resource: https://github.com/Graphify-Labs/graphify
    title: graphify, a tool that turns a folder into a knowledge graph
---

## 결정

- 검색은 `WikiSearch` 인터페이스 뒤에 둔다. 지금 구현(`hybridSearch`)은 세 단계다. trigram FTS5와 LIKE로 후보를 찾고, 제목·본문 출현과 맞은 단어 비율로 점수를 매기고, 상위 5개에서 `[[slug]]` 링크를 한 단계 따라간 페이지를 `via`와 함께 붙인다.
- wiki 페이지를 쓸 때마다 `TASKQ_HOME/wiki/<slug>.md`로 내보낸다. graphify 같은 폴더 기반 도구가 이 폴더를 색인하면, agent는 `graphify-out/GRAPH_REPORT.md`를 Read로 읽는다.
- 벡터 검색은 넣지 않았다.

## 이유

- 처음 쓴 unicode61 토크나이저는 공백으로만 나눈다. "검색률이"로 저장된 문장은 "검색률"로 찾지 못한다. 한국어는 조사가 붙으므로 재현율이 떨어지는 주된 원인이 여기였다. trigram은 세 글자 이상의 모든 부분 문자열로 찾고, 두 글자 단어("예산")는 LIKE로 보완한다.
- 벡터 검색은 임베딩 모델이 필요하다. Anthropic API에는 임베딩이 없어 다른 업체 키나 로컬 모델(수백 MB)을 더해야 하고, sqlite-vec 같은 확장은 bun으로 만드는 단일 바이너리 배포와 맞지 않는다. 팀 wiki는 수백 페이지 규모라 의미 검색이 없어도 단어 일치와 링크로 대부분 찾는다고 판단했다.
- 링크 확장은 graphify가 하는 관계 탐색의 가장 작은 형태다. 직접 맞지 않아도 맞은 페이지가 가리키는 페이지가 함께 나온다.
- graphify를 taskq 안에 넣지 않고 파일 미러로 연결한 이유는 Python 런타임과 Claude Code 설정 변경(hook, CLAUDE.md)이 함께 들어오기 때문이다[^graphify]. 사용자가 원할 때 폴더에 돌리면 되고, taskq는 결과 파일을 읽을 수 있게 경로만 연다.

## 잃는 것

- 같은 뜻의 다른 단어("비용"과 "요금")는 찾지 못한다. 그런 일이 잦으면 `WikiSearch`의 구현을 벡터나 graphify MCP로 바꾼다.
- 미러 파일을 고쳐도 wiki에 반영되지 않는다. 원본은 SQLite다.
