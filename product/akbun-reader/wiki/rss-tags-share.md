# RSS 구독·태그 관리·공개 링크

- RSS: 주소 등록, 15분마다 오래된 순으로 4개씩 수집, 지금 가져오기, 삭제
- 수집된 글: 제목·원문 링크·요약 목록, 보관함에 저장하면 기존 저장 흐름으로 본문 추출
- 태그: 검색, 이름 변경(같은 이름이면 병합), 삭제, 태그 클릭 시 전체 위치의 글 목록
- 공개 링크: 태그·RSS 화면에서 생성, 링크를 아는 누구나 조회, 관리 화면에서 전체 목록·삭제
- 공개 범위: 제목·원문 링크·저장일·AI 요약(태그)·피드 요약(RSS)만 포함, 본문 제외

## API

| 요청 | 내용 |
| --- | --- |
| GET /api/feeds | 구독 목록, 수집 상태·시각·글 수 |
| POST /api/feeds | url 필수, title 선택; 등록 직후 백그라운드 수집, 같은 URL이면 기존 반환 |
| GET /api/feeds/:id | 구독 하나 |
| POST /api/feeds/:id/refresh | 즉시 수집, 새 글 수 added 포함 |
| DELETE /api/feeds/:id | 구독·수집 글·공개 링크 삭제 |
| GET /api/feed-items?feed=id&offset=0 | 수집된 글, feed 생략 시 전체; 저장된 글은 document_id 포함 |
| GET /api/tags?q=검색어 | 태그와 문서 수, q는 부분 일치 |
| PATCH /api/tags/:name | name으로 이름 변경, 공개 링크도 따라감 |
| DELETE /api/tags/:name | 모든 문서에서 태그 제거 |
| GET /api/documents?location=all&tag=태그 | 위치와 무관한 태그 문서 목록 |
| GET /api/shares | 공개 링크 전체, 브라우저 인증만 허용 |
| POST /api/shares | kind tag 또는 feed, target 태그 이름 또는 RSS id; 이미 있으면 기존 반환 |
| DELETE /api/shares/:id | 공개 링크 삭제, 즉시 404 |
| GET /public/:id | 인증 없는 공개 페이지, noindex |
| GET /public/:id/data?offset=0 | 공개 목록 JSON |

- 태그 변경은 문서 version 증가와 changes 기록을 남기므로 CLI 동기화에 반영
- 공개 링크 생성·삭제는 API 토큰 요청 시 403; 유출 토큰으로 개인 목록을 공개하는 상황 방지
- RSS 주소는 본문 추출과 같은 공개 주소·DNS 검사, 512KB·리다이렉트 3회·8초 제한
- RSS 형식: RSS 2.0, Atom, RSS 1.0(RDF); 항목 100개까지 읽고 구독당 500개 보관
- 날짜 없는 항목은 수집 시각을 발행일로 사용

## Access 설정

- 공개 경로 /public/*는 Access 정책에서 bypass로 제외
- 우회 정책이 없으면 공개 링크가 로그인 화면으로 이동
- Worker는 /public/* 요청에서 Access JWT를 검사하지 않고 shares 테이블만 확인

## 검증 범위

- 파서·수집·중복 제거·태그 변경·공개 링크는 Node 테스트
- 실제 RSS 서버 수집과 Cron Trigger 실행은 배포 후 확인
