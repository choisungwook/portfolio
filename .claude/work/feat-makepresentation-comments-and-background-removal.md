# akbun-makepresentation 댓글과 그림 배경 제거, 이어서 렌더 성능

- Issue: PR 생성 시점에 작성
- Branch: feat/makepresentation-comments-and-background-removal

## 실행 계획

- [x] 1. PR 1(#1460, 선택·UI·표) 생성. CI 통과 후 squash merge 예정
- [ ] 2. 댓글 기능 구현 (도형별 댓글, 툴바 토글, 배지, PPTX 저장)
- [ ] 3. 그림 배경 제거 구현 (우클릭 Remove Background)
- [ ] 4. 검증, security-review, 코드 리뷰, PR 2 생성, squash merge
- [ ] 5. PR 3: 캔버스 렌더 성능 (pointermove 렌더 rAF 병합, 도형 레이어와 오버레이 레이어 분리), 버전 patch
- [ ] 6. 최종 디자인 설정을 GitHub Discussion에 정리

## 다음 세션이 알아야 할 것

- 이 branch는 PR 1 branch(`feat/makepresentation-selection-and-ui`) 위에 쌓음. PR 1이 squash merge되면 `git rebase --onto origin/master <PR 1의 마지막 commit> <이 branch>`로 옮김
- 사용자가 각 PR의 squash merge와 Discussion 작성을 명시적으로 지시함
- 버전: PR 2는 0.30.0, PR 3은 0.30.1
- 구현과 검증은 sonnet medium 서브에이전트, 설계는 주 세션
