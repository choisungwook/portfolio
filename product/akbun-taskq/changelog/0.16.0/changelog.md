# akbun-taskq 0.16.0

## Added

- bot 대화 입력창에서 `@`를 치면 다른 bot과 공용 폴더 파일을 자동완성한다. bot을 고르면 보낼 때 그 bot에게도 같은 메시지와 파일이 간다. 파일을 고르면 그 파일이 첨부된다.

## Changed

- 상단 바를 지웠다. 앱 이름과 지난 실행 검색은 없어지고(지난 실행은 검색 dialog의 작업 탭에서 찾는다), 확인 필요(종)와 설정은 사이드바 맨 아래 오른쪽 아이콘으로 옮겼다.
- `POST /api/bots/messages`의 `attachments`가 업로드한 파일뿐 아니라 공용 폴더 안의 기존 파일도 받는다. 폴더, 없는 파일, 공용 폴더 밖 경로는 거부한다.

## Removed

- "Needs a second check"(교차 확인)를 지웠다: 새 작업의 체크박스, 작업의 `review_required`, reviewer bot 지정, bot 도구 `review_task`. bot이 done으로 끝낸 작업은 바로 done이다.

## SDK

bot 도구 `review_task`가 없어졌다. 그 밖의 SDK 사용 변경 없음.
