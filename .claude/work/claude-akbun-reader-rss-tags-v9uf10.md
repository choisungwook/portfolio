# akbun-reader RSS 구독·태그 관리·공개 링크

- Issue: 미생성
- Branch: claude/akbun-reader-rss-tags-v9uf10

## 실행 계획

- [x] 1. migration 0004: feeds, feed_items, shares
- [x] 2. worker: rss(fetch·parse·refresh), tags(rename·delete), shares, public 경로, cron
- [x] 3. src: ui 분리, tags·feeds·shares 화면, public.html
- [x] 4. 테스트 추가, npm test·check 통과
- [x] 5. 문서: README, wiki, adr, knowledge, 버전 0.6.0
- [ ] 6. repo-pr-ship (Issue·PR·Copilot 리뷰·merge)

## 다음 세션이 알아야 할 것

- gh 없음. GitHub 조작은 MCP 도구, commit·push는 shell
- 공개 경로는 /public/<id>, Access 우회 정책 필요
