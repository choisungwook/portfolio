# Reader 웹 UI와 AI 보조 구현

- Issue: #1177, #1213, #1215
- Branch: feat/reader-ui-ai

## 실행 계획

- [x] 1. 규칙·지식·하위 이슈 확인과 작업 선정
- [x] 2. 문서·태그·토큰 API와 웹 UI·PWA 구현
- [x] 3. 비동기 AI 요약·추천·월별 상한 구현
- [x] 4. 로컬 API·브라우저 검증과 문서 갱신
- [ ] 5. 기록용 Issue·PR 생성과 Copilot 리뷰 요청
- [ ] 6. 리뷰 반영·CI 확인·squash merge·Issue close

## 다음 세션이 알아야 할 것

- 배포·원격 migration·유료 모델 호출 제외
- #1212 본문 추출은 별도 범위, 전달된 본문으로 AI 검증
- AI 키·모델·호출당 최대 비용 설정 전 비활성화
