# Rust CLI와 Markdown 동기화

- 환경 준비: [CLI 설정](03-setup.md)
- 명령: auth login·status·logout, list, save, tag, open, archive, export, import
- 모든 명령의 --json 옵션으로 JSON 출력; list 기본 출력은 표
- --server는 HTTPS origin, 로컬 테스트는 http://127.0.0.1만 허용
- 저장·수정 실패는 종료 코드 1, 문서 버전 충돌은 자동 덮어쓰기 없이 중단

## 문서 조작

URL 저장과 태그 추가, 보관함 이동 예시.

```bash
reader save https://example.com/article --tag reading
reader list --location inbox --json
reader tag <문서-UUID> reading rust
reader archive <문서-UUID>
reader open <문서-UUID>
```

- list는 최대 50개; 응답의 next_offset으로 다음 페이지 조회
- tag는 기존 태그를 유지하며 추가
- auth logout은 이 컴퓨터의 keychain 항목만 제거; 서버 토큰 폐기는 웹 설정에서 수행
- 로그인 콜백은 임의 포트·일회용 state·정확한 Origin과 Host·최대 4KB 본문 검사
- 로그인 대기는 180초; 콜백에서 /automation/me 확인 후 keychain에 저장
- 토큰은 명령 인자·설정 파일·URL에 저장하지 않음
- 브라우저는 토큰 발급을 명시적으로 누른 뒤 loopback POST 응답 확인
- 전달 실패 시 웹 설정에서 Rust CLI 토큰을 폐기하고 재실행

## 증분 export

문서 변경분을 지정한 vault에 기록.

```bash
reader export --vault /absolute/path/to/vault --json
```

- 파일명은 문서 UUID; 제목 변경에도 같은 파일 사용
- frontmatter에 title·url·tags·saved_at·location·deleted 기록
- 서버 본문은 관리 영역, 아래 notes 구분자 뒤만 사용자 메모 영역
- 파일 10개 이하 페이지를 모두 반영한 뒤 .reader-state.json 변경 번호 갱신
- 파일 쓰기는 같은 디렉터리 임시 파일에서 fsync 후 rename
- 중단 시 같은 페이지 재적용; 사용자 메모 유지
- 잠금으로 동시에 실행한 export 차단
- 다른 서버의 상태 파일, 심볼릭 링크, 관리 구분자 없는 기존 파일은 덮어쓰기 없이 중단
- 서버 삭제는 deleted: true인 문서로 표시; 메모 파일 자체 삭제 없음
- DB에서 로컬 파일로만 동기화; 역방향 편집·이미지 다운로드 없음
- 변경 기록 삭제·정리 기능 없음; DB 복원 후 변경 번호가 되돌아간 경우 상태 파일을 별도 백업하고 재동기화 필요
- Obsidian과 export의 동시 파일 편집은 피하고, notes 구분자 자체는 수정하지 않음

## CSV import

CSV와 해제한 본문 폴더를 지정하고 결과를 JSON으로 보관.

```bash
reader import documents.csv --bodies /absolute/path/to/export --json > import-report.json
reader import documents.csv --bodies /absolute/path/to/export --mapping columns.json --json
```

| 기본 열 | 값 |
| --- | --- |
| url | 원문 HTTP(S) URL |
| title | 제목 |
| tags | JSON 문자열 배열; CSV 인용 규칙 적용 |
| location | inbox·new, later·shortlist, archive |
| saved_at | 시간대가 있는 ISO 8601 저장일 |
| body_file | 본문 폴더 기준 상대 파일 경로, 없으면 빈 값 |
| category | article 등 원본 분류; rss·feed·highlight 제외 |

원본 헤더가 다를 때 사용하는 열 매핑 예시. 실제 CSV 확인 후 지정.

```json
{
  "url": "URL",
  "title": "Title",
  "tags": "Tags",
  "location": "Location",
  "saved_at": "Saved At",
  "body_file": "Body File",
  "category": "Category"
}
```

- 기존 서비스 CSV의 실제 헤더·본문 파일 연결 방식은 아직 실데이터로 검증하지 않음
- 필수 열·형식 누락 시 중단; 조용히 본문·날짜를 버리지 않음
- UTF-8 Markdown·텍스트·HTML 지원, HTML은 서버 경량 추출기 사용
- 본문 파일 100KB·API 요청 JSON 128KB 초과, PDF·EPUB은 중단; 임의 잘라내기 없음
- 제어문자·BOM·zero-width space 제거, NFC 정규화, 재태크→재테크 병합
- new→inbox, shortlist→later; feed 위치 제외
- 같은 정규화 URL은 기존 문서 반환, 원본·기존 메모 덮어쓰기 없음
- AI·URL 추출 호출 없음; 저장일·제목·태그·본문·위치 그대로 보관
- 요청 사이 100ms 간격, 서버에서 UTC 날짜별 신규 import 최대 3,000건
- 상한은 import의 쓰기량을 제한하는 장치; 다른 API의 일일 D1 사용량까지 보장하지 않음
- 오류 행 번호에서 중단; 원인을 수정한 후 처음부터 재실행 가능
- 보고서의 imported·existing·excluded, 고유 문서 수·결과 태그·서버 태그를 원본과 대조
- 실데이터 건수·본문·태그 대조와 구독 해지는 별도 사용자 작업
