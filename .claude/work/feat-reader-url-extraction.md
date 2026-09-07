# 공유 URL 본문 추출 구현

- Issue: #1212
- Branch: feat/reader-url-extraction

## 실행 계획

- [x] 1. 이슈·규칙·기존 지식 확인
- [x] 2. workspace AGENTS에 1,000줄 초과 코드 리팩터링 규칙 추가
- [x] 3. 안전한 URL 가져오기·본문 추출·비동기 저장 연동
- [x] 4. 단축어 안내·실패 상태 UI·테스트·CPU 측정
- [x] 5. 검증 결과·지식·구현 상태 기록

- [ ] 6. PR·Copilot 리뷰·CI·병합

## 다음 세션이 알아야 할 것

- 배포 없이 구현, 실제 Workers CPU 10ms와 iPhone 검증은 별도 표시
- 요청의 기존 body 입력 호환성 유지, URL-only 저장에 자동 추출 추가
- #1212는 실기기 공유 실행과 운영 CPU 검증이 남아 열린 상태 유지
