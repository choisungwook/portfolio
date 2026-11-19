# akbun-taskq UI/UX: impeccable 기준 평가와 수정

- Issue: #1535
- Branch: claude/taskq-agent-expansion-cqvk13

## 실행 계획

- [x] 1. 헤더: 알림 종과 설정을 오른쪽 위 끝으로 정렬
- [x] 2. impeccable 기준 자동 점검(대비, 터치 영역, 한쪽 줄무늬, 글리프 아이콘)과 화면 평가
- [x] 3. 한쪽 줄무늬(inset 3px) 제거: 전체 테두리 tint로
- [x] 4. 유니코드 글리프 아이콘을 SVG 아이콘으로
- [x] 5. 대비 부족(알림 숫자, 목록 시각, swatch, 검색 버튼) 수정
- [x] 6. 브라우저 표면(::selection, caret, scrollbar, focus, tabular-nums)
- [x] 7. 평가 보고서 남기기(knowledge), 문서, CHANGELOG, 버전
- [ ] 8. 데모 확인, 리뷰, PR, 머지

## 다음 세션이 알아야 할 것

- impeccable 원문은 scratchpad에 내려받음(`skill/reference/craft-floor.md`, `operate.md`, `audit.md`). npm CLI 실행은 권한에서 거부되어 규칙만 읽고 Playwright 스크립트로 점검함
- 점검 스크립트의 color-mix 배경은 `color(srgb …)`라 대비 계산에서 오탐(calendar block)
