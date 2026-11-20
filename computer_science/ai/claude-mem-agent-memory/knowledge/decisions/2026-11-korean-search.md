---
type: Decision
title: 관찰 검색은 trigram FTS5와 LIKE를 조합하고 OR로 묶는다
description: 한국어 조사와 2글자 단어, 에이전트의 긴 검색어 때문에 FTS5 기본 설정과 AND 검색이 결과를 놓친다.
tags: [sqlite, fts5, search, korean]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T12:00:00Z }
---

## 결정

- `observations_fts`는 `tokenize='trigram'`으로 만든다.
- 검색어를 공백으로 나누고, 3글자 이상은 FTS5 `MATCH`, 3글자 미만은 `LIKE '%단어%'`로 찾는다.
- 기본은 OR이고 일치 단어 수, 최신순으로 정렬한다. AND는 `--mode and`로만 쓴다.

## 이유

- `scripts/tokenizer_compare.py` 고정 문장 4개에서 `unicode61`은 "할인율", "적용", "pytest", "테스트"를 놓쳤다. 관찰 문장에 조사가 붙기 때문이다.
- `trigram`은 "할인", "버그", "쿠폰", "중복", "적용" 같은 2글자 검색어를 하나도 찾지 못했다.
- 에이전트는 "테스트 실행 도구 pytest unittest"처럼 단어를 많이 넣는다. AND 검색은 이 질의에 0건을 돌려줬다.
- 관찰은 프로젝트당 수천 행 수준이라 LIKE 전체 스캔 비용이 작다. 의미 검색(Chroma)은 의존성이 늘어 넣지 않았다.
