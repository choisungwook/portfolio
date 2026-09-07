# Release notes

## 0.5.0

- Rust CLI 로그인·문서 조작·증분 Markdown export 추가
- 원본 저장일·본문·태그를 보존하는 CSV import와 일일 상한 추가
- 자동화 토큰 전용 API·로컬 로그인 화면·CLI CI 추가

## 0.4.0

- 원격 MCP 도구 5개와 Bearer 인증 추가
- SDK·workerd 통합 검증 추가

## 0.3.1

- HTML 응답의 utf8 별칭과 Content-Type 공백 허용
- 명시적인 기본 포트 URL·리다이렉트 회귀 테스트 추가

## 0.3.0

- 공유 URL 선저장·비동기 본문 추출·AI 연결
- 사설 주소·DNS·리다이렉트 검사와 응답 크기 제한
- 추출 상태 UI·단축어 가이드·workerd CPU 측정 도구 추가
- Workers fetch의 redirect error 호환성 수정

## 0.2.1

- 토큰 관리를 Access 브라우저 인증으로 제한
- 목록 쿼리에서 본문 컬럼 제외

## 0.2.0

- 웹 읽기 보관함·태그 편집·PWA·토큰 설정 추가
- AI 3줄 요약·추천 승인·월별 호출 및 비용 상한 추가
- D1 migration·Access JWT와 토큰 검증 추가

## 0.1.0

- Product skeleton: Worker entry point, D1 schema migration, static page, tests, and verify workflow.
- No deployment yet. The Worker answers `/api/health` and `/api/normalize` only.
