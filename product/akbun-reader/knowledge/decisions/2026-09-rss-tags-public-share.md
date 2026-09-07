---
type: Decision
title: RSS 수집·태그 일괄 변경·공개 링크
description: RSS 항목을 문서와 분리 저장하고 태그 변경을 SQL 한 문장으로 처리하며 공개 링크는 Access 우회 경로 하나로 제공
tags: [reader, rss, tags, share, d1]
timestamp: 2026-09-07T00:00:00Z
---

## 결정

- RSS 항목은 feed_items 테이블에 저장하고 documents에는 사용자가 저장 버튼을 누른 것만 생성
- 저장 여부는 normalized_url로 documents와 LEFT JOIN해 표시, 별도 상태 컬럼 없음
- 수집은 Cron Trigger 15분 간격, 55분 이상 지난 구독을 4개씩 처리
- 태그 이름 변경·삭제는 json_group_array 서브쿼리 UPDATE 한 문장, 문서 version 증가
- 공개 링크는 shares 테이블의 32자 hex id, /public/<id> 경로, 태그·RSS당 하나
- 공개 링크 생성·삭제와 목록은 브라우저 인증만 허용

## 이유

- RSS 항목이 받은 글 목록에 섞이면 직접 저장한 글이 묻히고 CLI 동기화 대상도 불어남
- 저장 상태 컬럼을 두면 문서 삭제·재저장과 어긋나는 시점이 생김
- 무료 요금제 CPU 10ms 안에서 한 번에 처리할 수집 수를 제한해야 함; 대략 구독 1개당 1~2ms
- 문서별 UPDATE를 배치로 보내면 태그가 붙은 문서 수만큼 statement가 늘어 D1 batch 한도에 걸릴 수 있음
- Access가 호스트 단위라 두 번째 호스트를 두는 것보다 경로 하나를 우회하는 편이 배포가 단순함
- 유출된 API 토큰으로 개인 목록을 공개하는 경로를 막기 위해 토큰 관리와 같은 규칙 적용

## Citations

1. [ADR: Public share pages bypass Access on one path](../../adr/2026-09-public-share-path.md)
2. [wiki: RSS 구독·태그 관리·공개 링크](../../wiki/rss-tags-share.md)
