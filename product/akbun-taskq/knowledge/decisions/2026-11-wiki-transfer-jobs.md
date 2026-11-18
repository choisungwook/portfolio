---
type: Decision
title: Wiki export and import run as resumable background jobs, and import digests files into pages
description: A small job runner with checkpoints runs export (zip at deflate level 9) and import; import turns documents into searchable, linked pages instead of storing an archive.
tags: [wiki, jobs, import]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T23:30:00Z }
---

## 결정

- `jobs` 테이블과 프로세스 안 runner를 둔다. job은 단계마다 진행률과 checkpoint를 저장하고, 사용자가 취소하면 지금 단계 뒤에 멈추며, 재개하면 checkpoint에서 이어 한다. 재시작 때 돌던 job은 다시 큐에 넣는다.
- 내보내기는 zip 하나다. 압축은 deflate level 9이다. xz나 zstd처럼 더 줄어드는 형식이 있지만 OS 기본 도구가 열지 못한다.
- 가져오기는 파일을 그대로 저장하지 않고 페이지로 소화한다. 문서마다 페이지, 긴 문서는 `##` 절마다 페이지, 상대 링크는 `[[slug]]`, 마지막에 색인 페이지를 만든다.
- zip 읽기·쓰기는 `node:zlib`로 직접 구현한다. 의존성을 더하지 않는다.

## 이유

- bot은 wiki를 `wiki_search`와 `[[링크]]` 확장으로 읽는다. zip이나 큰 파일 하나를 넣으면 검색에 걸려도 한 페이지 20,000자 제한에 막히고 링크도 없다. 절 단위 페이지와 링크가 있어야 검색 결과가 필요한 부분을 가리킨다.
- 큰 문서 묶음은 시간이 걸리고 중간에 멈출 수 있다. 진행률과 이어 하기를 요청마다 따로 만들지 않고 job 하나로 묶으면 다음 긴 작업도 같은 방식을 쓴다.
- 같은 내용의 페이지는 다시 쓰지 않으므로, 이어 하기가 마지막 단계를 반복해도 revision이 늘지 않는다.
- 의미 요약(LLM으로 문서를 요약)은 하지 않았다. 비용이 들고 실패가 결정적이지 않다. 필요하면 bot이 색인 페이지에서 시작해 요약을 wiki에 쓴다.

관련: [Team wiki search](2026-11-wiki-hybrid-search.md)
