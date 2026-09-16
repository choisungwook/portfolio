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

## 편집 명령 지원 범위

- 기준: 0.45.0의 MCP 도구와 Rust AI 편집 허용 목록
- 아래 명령은 preview_edits 또는 apply_edits의 commands 배열에 객체로 전달
- 실제 필드 형식은 연결된 서버의 editing_guide를 우선 확인

| 편집 | 허용 명령 | 범위 |
| --- | --- | --- |
| 트랙 추가 | addTrack | video / audio / subtitle |
| 클립 배치 | addClip, insertSource | 가져온 미디어로 클립 추가·원본 구간 삽입 |
| 위치·길이 편집 | moveClip, trimClip, splitAt, removeClip | 이동·트림·분할·삭제 |
| 구간 일괄 삭제 | removeRanges | 모든 트랙의 지정 구간 제거와 간격 닫기 |
| 볼륨·속도 | setClipGain, setClipPlayback, setClipVolumeKeyframe | 볼륨·불투명도·속도·피치 유지·페이드·볼륨 곡선 |
| 그래픽·자막 추가 | addOverlayVisualItem, addVisualItem | 텍스트·도형·이미지·영상 오버레이, subtitle 트랙의 텍스트 |
| 그래픽·자막 변경 | setVisualContent, setVisualTransform, setVisualTiming, removeVisualItem | 내용·변환·노출 구간 변경·삭제 |
| 모션 | setVisualKeyframe | x / y / width / height / rotation / opacity |
| 자막 스타일 | setSubtitleStyle | 자막 트랙 스타일 |
| 전환 | addTransition | 인접 클립 디졸브 추가 |
| 마커 | addMarker | 이름·색·위치 지정 |

## MCP에 노출되지 않은 기능

- 음성 전사와 무음 감지 작업 시작·취소: 앱의 Captions / Silence 이용
- SRT 파일 가져오기·내보내기: 앱의 Import SRT / Export SRT 이용
- 재생·일시정지·재생 위치 이동·현재 선택 항목 조회: 화면 조작 이용
- 트랙 삭제·숨김·음소거, 클립 연결/해제, 키프레임 삭제, 기존 전환 수정/삭제, 마커 수정/삭제: 해당 명령은 AI 허용 목록에서 제외
- 기존 프로젝트의 캔버스·프레임레이트 변경: new_project 생성 설정과 별개, SetSettings 미노출
- 전용 블렌드·시각 스타일 변경 명령과 adjustment/LUT 내용: AI 허용 목록에서 제외
- 디자인 라이브러리 저장·삭제: get_library는 조회만 제공, 앱 Studio에서 관리
- 프로젝트 파일 삭제, 원본 파일 수정, 앱 설정·업데이트 조작: 전용 도구 없음
- 임의 JavaScript·셸·ffmpeg 명령 실행, 미디어 다운로드·생성: 도구 없음
- 위 기능이 필요하면 사용자의 허용 범위에서 화면 조작으로 전환하거나 가능한 대안 설명

## 시간과 데이터 규칙

- 편집 시각: 프로젝트 rate.num / rate.den 기준 정수 프레임
- sample_asset의 startMs / endMs와 자산 durationMs만 밀리초
- insertSource의 inPoint / outPoint는 원본 구간, start는 배치할 타임라인 위치
- 시각 항목·볼륨 키프레임의 frame은 해당 항목·클립 시작 기준
- 위치·크기는 프로젝트 픽셀. 화면 캡처의 픽셀 좌표와 혼용 금지
- removeRanges는 삭제 전 좌표의 구간들을 한 번에 전달. 적용 후 변경된 타임라인 재조회
- preview_edits는 편집 모델 검증 결과이며 영상 프레임 이미지가 아님
- sample_asset은 원본 이미지 표본이며 최종 타임라인 합성 화면이 아님
- get_library의 템플릿은 조회 후 현재 프로젝트에 맞는 편집 명령으로 변환해 적용

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
