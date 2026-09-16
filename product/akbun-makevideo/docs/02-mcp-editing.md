# MCP 편집과 복구

- 환경 준비: [로컬 MCP 연결](./01-mcp-setup.md)
- AI가 편집을 바로 적용하며 앱에서 별도 Apply 클릭 불필요
- 미디어 원본은 복사·수정하지 않고 경로 참조

## 도구

| 작업 | 도구 |
| --- | --- |
| 명령 형식·현재 프로젝트 조회 | editing_guide, get_project, list_projects |
| 새 프로젝트·열기·미디어 가져오기 | new_project, open_project, import_media |
| 컷·자막·도형·텍스트·키프레임 | preview_edits, apply_edits |
| B-roll 프레임·디자인 조회 | sample_asset, get_library |
| 복구 지점 | create_checkpoint, list_checkpoints, restore_checkpoint |
| 일반 실행 취소·재실행 | undo, redo |
| 파일 저장 | save_project |
| 영상 출력·진행 조회·취소 | export_video, render_status, cancel_render |

## 편집 순서

1. editing_guide와 get_project로 명령 형식·실제 ID·프레임레이트 확인
2. create_checkpoint로 사용자 작업 시작점 저장, 반환된 checkpointId 기록
3. 작업을 작은 apply_edits 배치로 나누어 적용
4. 반환된 최신 stateToken으로 다음 작업 수행
5. 결과 확인 후 save_project, 필요한 경우 export_video 실행
6. render_status의 result.ok가 true인지 확인

- 하나의 apply_edits는 최대 256개 명령을 원자적으로 적용하며 일반 Undo 한 번으로 취소
- 각 편집·프로젝트 전환·복구 직전에 별도 영속 스냅샷 자동 저장
- 작업 전체 롤백은 첫 create_checkpoint ID 사용
- 자막은 subtitle 트랙의 text visual item으로 생성·편집. 음성 전사는 앱의 기존 Captions 기능이나 별도 전사 결과 활용
- sample_asset은 최대 60초 구간의 8개 표본 이미지 제공. 전체 움직임·음성 분석을 의미하지 않음
- export_video는 기존 파일을 덮어쓰지 않으므로 새 파일명 지정
- 앱의 일반 수동 편집이 끼어들면 오래된 stateToken 거절

## 프롬프트 예시

> 작업 시작 전 “인터뷰 컷 편집 전” 복구 지점을 만들고 ID를 기억해. 현재 자막을 기준으로 중복 설명을 줄여 60초로 편집해. 원본 음성의 의미는 유지하고 변경 결과를 확인해.

> 현재 프로젝트의 B-roll 영상을 구간별로 샘플링해서 확인해. 실제로 관찰한 장면만 사용해 본편 위에 배치하고, 첫 2초에 제목을 넣어줘.

> “인터뷰 컷 편집 전” 복구 지점으로 전체 편집을 되돌려줘. 복구 후 프로젝트 상태를 다시 확인하고 같은 프로젝트 파일에 저장해.

> 현재 프로젝트를 /absolute/path/final.akbunvideo에 저장하고 /absolute/path/final-v2.mp4로 FHD 출력해. 렌더 완료 결과까지 확인해.

## 복구 범위

- 보관 대상: 트랙·클립·자막·그래픽·미디어 참조·프로젝트 설정
- 앱을 종료해도 유지
- 복구 직전 상태도 저장하므로 잘못된 복구를 다시 되돌릴 수 있음
- 복구하면 일반 Undo/Redo 이력 초기화, 이후 복구는 checkpoint ID 사용
- 복구된 문서는 저장 전 상태. 파일을 바꾸려면 save_project 별도 실행
- 복구 대상에서 제외: 이동·삭제된 원본 미디어, 이미 생성된 MP4, 앱 설정, 디자인 라이브러리
- 저장 파일을 덮어쓰기 전 기존 파일 내용도 별도 복구 지점에 보관

## 복구 파일

- macOS: ~/Library/Application Support/io.akbun.makevideo/mcp-checkpoints/
- JSON 파일에 프로젝트 상태와 이름·시각 저장
- list_checkpoints는 최근 100개 표시, 기존 ID를 알고 있으면 더 오래된 것도 복구 가능
- 자동 삭제 없음. 디스크 정리가 필요하면 사용자가 불필요한 복구 파일만 정리
- 복구 파일에는 원본 미디어 경로 포함. 다른 사람에게 공유할 때 해당 경로 확인
