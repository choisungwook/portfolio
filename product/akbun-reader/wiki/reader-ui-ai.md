# 읽기 화면과 AI 요약

- 목록: 받은 글·나중에·보관한 글, 태그 필터, 50개씩 추가 조회, 항목에서 바로 위치 이동
- 위치 전환: 데스크톱은 사이드바, 700px 이하 모바일은 하단 고정 세그먼트 컨트롤
- 본문: 읽음 표시, 위치 이동, 태그 편집, 원문 링크
- Markdown: 제목·문단·코드 블록 표시, HTML은 문자 그대로 출력
- 추천 태그: 버튼을 눌러 승인한 태그만 문서에 추가
- 설정: 이름·권한(저장·수정 또는 읽기 전용)을 붙인 API 토큰 발급·폐기, 월별 AI 사용량, 단축어 안내
- 홈 화면: Safari 공유 메뉴에서 홈 화면에 추가
- 오프라인 읽기·Service Worker·개인 데이터의 브라우저 저장소 보관 제외

## API

- 로컬 환경 준비: [개발 환경](development.md)
- 인증: Access JWT 또는 Authorization Bearer 토큰, 인증 없는 개인 API는 401
- 토큰 목록·발급·폐기: Access 브라우저 인증만 허용, API 토큰 요청은 403
- 읽기 전용 토큰(scope read): GET·HEAD만 허용, 변경 요청과 /mcp는 403
- 브라우저 변경 요청: 같은 사이트 Origin 필수
- 개인 응답: Cache-Control no-store

| 요청 | 내용 |
| --- | --- |
| GET /api/documents?location=inbox&tag=태그&offset=0 | 문서 목록, 다음 페이지의 next_offset |
| POST /api/documents | url 필수, title·tags·body 선택; 동일 URL이면 기존 문서 반환 |
| GET /api/documents/:id | 본문·요약·추천·version 포함 |
| PATCH /api/documents/:id | version 필수; tags·location·is_read 또는 approve_tags 수정 |
| GET /api/tags | 사용 중인 태그와 문서 수, 관리 API는 [RSS·태그·공개 링크](rss-tags-share.md) |
| GET /api/tokens | 토큰 이름·식별자·scope·발급일·폐기일, 원문·해시 제외 |
| POST /api/tokens | name 입력, scope는 read 또는 write(기본), token 원문은 이 응답에만 포함 |
| DELETE /api/tokens/:id | 토큰 폐기 |
| GET /api/ai | AI 활성화 여부·월별 호출 수·예약 비용 |
| GET /api/me | 현재 인증 확인 |

- 수정 충돌: 409 응답 후 문서를 다시 열어 최신 version으로 재시도
- 저장 한도: 요청 128KB, 본문 100,000자, 태그 30개·각 80자
- URL 자동 본문 추출: body 없는 신규 저장에 비동기 적용, [추출 정책](url-extraction.md) 참고
- AI 실행: 직접 전달된 본문은 저장 후, URL-only 문서는 본문 추출 후 실행; 본문 또는 설정이 없으면 skipped
- AI 완료 확인: 문서 화면 새로고침
- 중복 URL 재저장: 기존 문서·AI 결과 유지, 추가 호출 없음

## AI 설정

- 기본 상태: 비활성화
- AI_API_KEY: Worker secret, 소스·클라이언트·응답에 포함 금지
- 로컬 설정: git에서 제외된 workspace/.dev.vars

| 변수 | 값 |
| --- | --- |
| AI_BASE_URL | HTTPS OpenAI 호환 API의 base URL, 예: /v1까지 |
| AI_MODEL | 사용할 모델 식별자 |
| AI_MONTHLY_CALL_LIMIT | 1~300 정수 |
| AI_MONTHLY_BUDGET_WON | 1~1,000 정수, 호스팅 비용과 별도 |
| AI_MAX_CALL_WON | 호출 1회 최악 비용을 올림한 원 단위 양의 정수 |

- 모든 설정이 유효해야 실행
- 제공자 조건: chat/completions, max_tokens, JSON 응답 형식 지원
- 입력 한도: 본문 앞 12,000자, 기존 태그 최대 400개
- 출력 한도: 512 토큰, 요약 정확히 3줄·각 500자 이하
- 비용 예약: 외부 요청 전에 SQL 조건부 증가로 월 호출·비용 상한 함께 검사
- 실패·타임아웃도 예약 차감 유지, 자동 재시도 없음
- AI_MAX_CALL_WON은 본문·시스템 문구·태그 입력과 출력의 최대 비용, 환율·과금 여유분까지 포함해 설정
- 실제 과금 보장은 제공자의 비용 제한도 함께 설정해야 가능; 모델 가격 변경 시 호출당 예약 비용 재산정
- 다른 모델로 교체: SummaryProvider 인터페이스 구현

## 검증 범위

- SQLite 기반 API 테스트: 인증·폐기·중복·버전 충돌·AI 상한·실패 격리
- 로컬 Wrangler D1: migration, 저장·태그·토큰 API
- 내장 브라우저: 목록·본문·추천 승인·읽음·위치·설정, 390px 모바일 레이아웃
- 실기기 iPhone Safari 설치와 실제 Access 로그인: #1216 배포 설정 이후 검증
- 유료 모델 호출·원격 migration·배포 미실행
