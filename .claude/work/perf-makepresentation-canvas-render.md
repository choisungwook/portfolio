# akbun-makepresentation 캔버스 렌더 성능

- Issue: PR 생성 시점에 작성
- Branch: perf/makepresentation-canvas-render

## 실행 계획

- [x] 1. PR 1(#1460) merge, PR 2(#1463) 생성
- [ ] 2. PR 2 CI 통과 후 squash merge, Issue #1461·#1462 close, 이 branch를 master 위로 rebase
- [ ] 3. 렌더 성능 구현: 도형 레이어와 오버레이 레이어 분리, pointermove 렌더를 프레임당 1회로 병합
- [ ] 4. 검증(전후 측정 포함), security-review, 코드 리뷰, PR 3 생성, squash merge
- [ ] 5. 최종 디자인 설정을 GitHub Discussion에 정리

## 다음 세션이 알아야 할 것

- 이 branch는 PR 2 branch(`feat/makepresentation-comments-and-background-removal`) 위에 쌓음. PR 2가 squash merge되면 `git rebase --onto origin/master <PR 2의 마지막 commit> perf/makepresentation-canvas-render`
- 사용자가 각 PR의 squash merge와 Discussion 작성을 명시적으로 지시함
- 버전: 0.30.0 → 0.30.1
- 구현과 검증은 sonnet medium 서브에이전트, 설계는 주 세션
