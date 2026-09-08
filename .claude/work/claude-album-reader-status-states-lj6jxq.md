# akbun-reader 목록 하단 세그먼트로 inbox·later·archive 전환

- Issue: 없음 (PR 생성 시 발급)
- Branch: claude/album-reader-status-states-lj6jxq

## 실행 계획

- [x] 1. index.html·app.js·ui.js·styles.css에 하단 고정 세그먼트 컨트롤과 목록 항목 이동 버튼 추가
- [x] 2. package.json 0.7.0, RELEASE_NOTES, wiki/reader-ui-ai.md 갱신
- [x] 3. npm test·npm run check 통과 확인
- [x] 4. commit·push

## 다음 세션이 알아야 할 것

- DB·API는 location(inbox/later/archive)을 이미 지원. 배포 중이므로 migration·API 변경 없이 화면만 바꿈
