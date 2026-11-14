# akbun-makevideo 화면을 makepresentation 디자인 설정(Discussion #1466)에 맞춤

- Issue: PR 생성 때 발급
- Branch: claude/bold-planck-ifilao

## 실행 계획

- [x] 1. 설계: `product/akbun-makevideo/designs/README.md`의 Visual system 절과 `tokens.tokens.json` 작성
- [ ] 2. 구현: `workspace/src`의 CSS 5개와 `index.html` toolbar 마크업, 버전 0.50.0 → 0.51.0
- [ ] 3. 검증: 새 컨텍스트 리뷰, light와 dark 스크린샷, `npm test`
- [ ] 4. knowledge decision 기록, 이 파일 삭제, PR 생성

## 다음 세션이 알아야 할 것

- Discussion 본문은 WebFetch 요약으로만 읽힘. 값의 원본은 `product/akbun-makepresentation/workspace/src/style.css`의 `:root`
- `--stage`는 makevideo에서 monitor 배경이었음. `--monitor`로 이름을 바꾸고 `--stage`는 toolbar 띠와 lane 배경으로 씀
- clip 선택색은 `--select`(주황) 유지. video clip이 파란 계열이라 `--accent` 윤곽과 구분되지 않음
