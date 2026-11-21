# akbun-taskq 0.25.0

## Added

- Plugins의 공식 marketplace 목록에서 plugin을 바로 설치한다. 설치는 marketplace가 적어 둔 commit만 git으로 받아(큰 저장소 안의 폴더면 그 폴더만) `TASKQ_HOME/plugins/<이름>`에 두고 bot용 plugin으로 등록한다. bot 설정에서 고르기 전에는 아무것도 실행되지 않는다. 이미 등록된 것은 설치됨으로 보이고, git으로 받을 수 없는 항목은 설치할 수 없음으로 보인다.
- 설치한 plugin의 업데이트는 marketplace의 현재 commit으로 다시 설치하고 그 plugin을 쓰는 bot을 다시 불러온다. 삭제하면 taskq가 받은 폴더도 지운다. 경로로 등록한 폴더는 지우지 않는다.
- `POST /api/plugins/install`과 `taskq api plugins_install`.

## Changed

- Plugins 화면을 가운데 한 열로 정리했다. 절은 카드 대신 제목과 간격으로 나누고, 항목은 구분선 행(머리글자 아이콘, 이름, 설명, 쓰는 bot, 경로, 오른쪽 동작)으로 보인다. marketplace는 두 열이고, 경로로 등록하는 칸은 "경로로 추가"를 펼쳐야 보인다.

## SDK

변경 없음.
