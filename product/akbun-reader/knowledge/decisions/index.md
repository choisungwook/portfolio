# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [AI 비용 선예약과 문서 단위 태그 변경](2026-09-reader-ai-reservation.md) - 비용 상한·태그 승인·원자적 변경 정책.
* [URL 선저장과 경량 본문 추출](2026-09-background-extraction.md) - 추출 실패 격리와 workerd 측정 근거.
* [요청 단위 MCP](2026-09-stateless-mcp.md) - SDK 전송·Bearer·버전 충돌 정책.
* [CLI 동기화와 import](2026-09-cli-sync-import.md) - 인증 경로·메모 보존·이관 상한.
* [RSS 수집·태그 일괄 변경·공개 링크](2026-09-rss-tags-public-share.md) - 별도 테이블·SQL 한 문장 변경·Access 우회 경로.
* [외부 동기화용 읽기 전용 API 토큰](2026-09-read-only-token-scope.md) - scope 열·GET 전용·MCP 거부·변경 번호 API 재사용.
