# akbun-taskq 0.14.0

bot이 만든 파일을 공용 폴더에 모으고, 대화에서 바로 열어 보게 한다. 공용 폴더를 파일 관리자처럼 보고 정렬한다. 디자인 시스템을 Astryx로 바꾸고 왼쪽 메뉴를 줄였다.

## Added

- bot이 만든 파일(HTML, Markdown, 슬라이드, 문서 등)은 공용 폴더의 `outputs/<bot>/`에 저장하고 `send_message`의 `files`로 넘긴다. 공용 폴더 밖의 파일은 거부한다.
- 대화의 파일 칩을 누르면 오른쪽 파일 창에 보인다. HTML은 sandbox iframe(별도 미리 보기 주소, 인라인 스타일·스크립트와 같은 폴더의 이미지·CSS 동작), Markdown은 렌더링, 이미지·텍스트는 그대로 보이고, 그 밖의 파일은 열기(이 컴퓨터의 앱)와 공용 폴더에서 보기를 제공한다.
- 공용 폴더의 보기(목록, 자세히, 아이콘)와 정렬(이름, 종류, 크기, 수정한 날짜, 오름·내림차순). 파일을 누르면 같은 파일 창에 보인다.
- `POST /api/shared/preview`(operation `file_preview`): HTML 미리 보기용 10분짜리 주소.
- `POST /api/open-file`(operation `file_open`): 공용 폴더의 파일을 이 컴퓨터의 앱으로 열거나 그 폴더를 연다.

## Changed

- 디자인 시스템을 Meta의 Astryx(neutral 테마)로 바꿨다. 색, 모서리, 그림자, 글꼴 순서를 `astryx.css`가 토큰 계약에 채운다. 이전 soft 테마는 `soft.css`로 남는다.
- 왼쪽 메뉴에서 제안, 목표, 토론을 뺐다. 기능은 API와 CLI(`taskq api proposals_list` 등)로 남는다.
- 파일 창의 열기는 문서·이미지 같은 종류만 앱으로 연다. 실행 비트가 있는 파일과 스크립트는 거부하고 공용 폴더에서 보기나 내려받기를 쓴다.

## SDK

SDK 사용 변경 없음.
