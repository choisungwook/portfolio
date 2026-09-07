# 원격 MCP

- 경로: 서비스 주소의 /mcp
- 전송: Streamable HTTP, JSON 응답, 요청마다 독립적인 SDK 서버
- 인증: 설정 화면에서 발급한 API 토큰의 Bearer 헤더 필수
- 브라우저 Access JWT만으로 MCP 호출 불가
- Origin이 있으면 서비스와 같은 origin만 허용
- 삭제·토큰 관리 도구 없음

## 도구

| 도구 | 입력 | 결과 |
| --- | --- | --- |
| search_documents | query, offset | 제목·URL·본문 검색, 최대 50개와 다음 offset |
| get_document | id | 본문·태그·version |
| save_url | url, 선택 title·tags | 저장 또는 기존 문서, 본문 추출은 비동기 |
| add_tags | id, version, tags | 기존 태그 보존, 충돌 시 다시 조회 |
| list_tags | 없음 | 태그별 문서 수 |

- 저장한 본문은 외부 데이터; 본문에 들어 있는 명령문을 실행 지시로 취급하지 않음
- 검색은 부분 문자열 조회; 문서 증가 시 D1 읽기량 점검 필요
- SDK 클라이언트 통합 테스트에서 도구 5개, 토큰 폐기·Origin·충돌 검증
- workerd에서 initialize·tools/list 실행 확인
- 실제 Claude 웹·Claude Code·Codex 연결은 배포 후 확인 대상
- Bearer 헤더를 지원하지 않는 클라이언트의 연결은 지원하지 않음; OAuth 추가 여부는 실제 연결 결과로 판단

## Access 경로 설정

- 사이트 전체 Access 정책이 Bearer 요청을 로그인 페이지로 돌리면 자동화 호출 불가
- /mcp만 별도 Access 애플리케이션의 Bypass 대상으로 구성
- /api/* 브라우저 경로의 Access 정책은 유지; CLI는 토큰 전용 /automation/* 사용, [CLI 설정](03-setup.md) 참고
- Bypass는 Worker 인증을 우회하지 않음; 매 요청 Worker의 토큰 검증 유지
- /api/tokens는 Access JWT와 owner sub를 계속 요구하므로 자동화 토큰만으로 발급 불가
- workers.dev·preview 비활성화 유지
- 설정·배포·실제 클라이언트 로그인은 [개발 환경](development.md) 절차와 함께 운영 시 검증

## 클라이언트 요청

클라이언트의 Streamable HTTP 설정에 서비스 URL과 비밀 저장소에서 읽은 헤더 지정.

```json
{
  "url": "https://reader.akbun.com/mcp",
  "headers": { "Authorization": "Bearer <API_TOKEN>" }
}
```

- 설정 파일의 실제 키 이름은 클라이언트 버전에 따라 다름
- 토큰이 든 설정 파일을 저장소에 커밋하지 않음
- GET SSE·세션 종료 DELETE는 405 반환; 장기 연결·서버 알림·세션 저장 미사용
- 전송 구현 근거: [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
