# akbun-makevideo 사용자 매뉴얼

- 로컬 영상·음성·이미지를 타임라인에서 편집하고 MP4로 출력하는 데스크톱 앱
- 기준: 저장소의 0.45.0 구현. 설치본 버전과 기능 차이가 있으면 Settings → About에서 확인
- 사용 방식: 직접 화면 편집, 앱 내부 Astra Studio, 외부 Codex·Claude의 MCP 제어
- AI에게 제품 설명을 전달할 때: [ai-manual.md](./ai-manual.md)

## 현재 기능

| 분류 | 제공 기능 | 화면 진입점 |
| --- | --- | --- |
| 프로젝트 | 새로 만들기·열기·저장·다른 이름 저장·삭제 | Project |
| 미디어 | 영상·음성·이미지 가져오기, 원본 경로 참조 | Assets → Import… |
| 원본 구간 | 원본 재생, In/Out, 영상·음성 선택, Insert·Overwrite·Append | Source Monitor |
| 컷 편집 | 이동·트림·분할·삭제·Ripple Delete·스냅·영상/음성 연결 | Timeline, Edit |
| 트랙 | 영상·오디오·자막 트랙 추가, 숨김·음소거 | Timeline |
| 재생 | 프레임 이동·편집점 이동·전체 화면·미리보기 품질 | Program Monitor, Playback |
| 음성 | 볼륨·속도·피치 유지·페이드·볼륨 키프레임 | Inspector → Audio |
| 제목·도형 | 텍스트, 사각형·타원·선/화살표·다각형·별 등 | + Text, Shape, Inspector |
| 레이어 | 위치·크기·회전·불투명도, 키프레임, 블렌드 | Inspector |
| 그래픽 스타일 | 색·그라데이션·미디어 채우기·외곽선·그림자 | Inspector의 Text / Shape |
| PIP·B-roll | 원본 영상 오버레이, 크롭·테두리·둥근 모서리·오디오 설정 | Source Monitor → Add PIP, Inspector |
| 전환 | 인접 클립 사이 디졸브 | 타임라인의 클립 경계, Inspector |
| 자막 | SRT 가져오기·내보내기, 문구·시각·스타일 편집 | Import SRT / Export SRT, Inspector |
| 음성 기반 편집 | 제공자 API를 통한 자막 생성, 로컬 무음 감지·제거 | Edit → AI, AI → Captions / Silence |
| Astra Studio | 자막 기반 컷 제안, B-roll 표본 분석, 그래픽·음악 배치 제안 | AI → Studio |
| 디자인 재사용 | 선택한 텍스트·도형의 디자인·애니메이션과 자막 스타일 저장·적용 | Studio → Finish |
| AI 대화 | Codex 기반 대화와 이미지 요청 | AI → Chat |
| 마커 | 편집 위치 표시와 탐색 | Marker |
| 재생 보조 | 프록시·파형, 그래픽 장치와 미리보기 품질 설정 | Settings → Proxy Media / Preview & Tools |
| 영상 출력 | FHD·4K MP4, 진행 표시·취소, 지원 장치의 하드웨어 인코딩 | Render |
| 복구 | 일반 Undo/Redo, MCP 작업의 영속 복구 지점 | Edit 또는 MCP |
| 앱 관리 | 테마·단축키·도구 설정, 업데이트 확인 | Settings |

- 앱의 모든 기능이 MCP로 노출된 것은 아님. 아래 MCP 지원 범위 참고
- `.akbunvideo`는 편집 정보와 원본 파일 경로 저장. 미디어 자체를 포함하는 패키지 아님
- 원본 파일을 이동·삭제하면 미리보기와 렌더에 영향
- 프록시는 재생용이며 출력은 원본 미디어 사용

## 시작 준비

- 영상 분석·출력에 ffmpeg 필요
- 직접 편집에는 AI 계정 불필요
- 앱 내부 AI 대화·Studio와 음성 전사의 준비 사항은 [README의 Requirements](./README.md#requirements) 참고
- 외부 AI 연결과 개발 실행은 [로컬 MCP 설치·연결](./docs/01-mcp-setup.md) 참고
- 앱 내부 Astra 설정과 외부 MCP 연결은 서로 다른 기능

## 화면 읽기

| 화면 | 보는 대상 |
| --- | --- |
| Assets | 가져온 원본 파일 목록 |
| Source Monitor | 선택한 원본 하나와 사용할 In/Out 구간 |
| Program Monitor | 현재 타임라인의 합성 결과 |
| Timeline | 클립·자막·그래픽의 시간 배치 |
| Inspector | 현재 선택한 클립·레이어의 속성 |

- 창 내부 상단의 Project / Edit / Render / Playback / Settings 메뉴 사용
- 우측 패널 버튼을 누르면 해당 패널 열기, 다시 누르면 닫기

## 첫 영상 편집

1. Project → New Project로 프로젝트 생성
2. Assets → Import…에서 원본 파일 가져오기
3. Assets의 영상을 타임라인으로 드래그하거나 Source Monitor에서 구간 선택 후 Insert
4. 재생 위치를 옮기고 Cmd+B로 분할
5. 불필요한 클립 선택 후 Delete, 간격도 닫으려면 Shift+Delete
6. + Text로 제목 추가, 선택 후 Inspector에서 문구·위치 수정
7. Program Monitor에서 편집점 전후와 음성 확인
8. Project → Save로 프로젝트 저장
9. Render에서 FHD 또는 4K 선택 후 새 MP4 경로 지정
10. 완료 메시지와 출력 파일 재생 확인

- 중요한 편집 전에는 Save As…로 작업 전 복사본 보관
- Source Monitor의 원본 재생만으로 최종 영상 확인을 대신하지 않음
- FHD·4K는 긴 변 길이. 세로 프로젝트 비율은 유지

## 자막과 AI Studio

- 이미 자막 파일이 있으면 Import SRT 사용
- 음성 전사가 필요하면 AI → Captions에서 소스·제공자·언어 설정 후 Generate captions
- 전사 결과의 고유명사·숫자·타이밍은 직접 확인
- Studio의 Prepare에서 자막과 B-roll 문맥 준비
- Story에서 컷 정리, Layers에서 B-roll·그래픽·음악 배치, Finish에서 자막 스타일·디자인 재사용
- Studio의 제안은 변경 목록 검토 후 적용
- 외부 MCP의 apply_edits는 별도 Apply 버튼 없이 즉시 적용

## MCP로 가능한 편집

| 요청 예 | 지원 내용 | 필요한 자료·조건 |
| --- | --- | --- |
| “중복 설명을 줄여줘” | 클립 분할·트림·이동·삭제, 지정 구간 일괄 제거 | 실제 자막이나 사용자가 지정한 구간 |
| “원본의 5~10초를 뒤에 넣어줘” | 원본 In/Out 구간을 타임라인에 삽입 | 가져온 미디어와 대상 트랙 |
| “배경 음악을 깔고 끝에서 줄여줘” | 오디오 배치, 볼륨·페이드·볼륨 키프레임 | 로컬 음악 파일 |
| “이 장면을 빠르게 해줘” | 클립 속도·피치 유지 설정 | 대상 클립 |
| “처음 2초에 제목을 넣어줘” | 텍스트·도형·이미지 추가와 위치·크기·회전·불투명도 조절 | 문구 또는 가져온 이미지 |
| “제목이 천천히 나타나게 해줘” | 시각 항목의 위치·크기·회전·불투명도 키프레임 | 대상 그래픽 |
| “여기에 B-roll을 겹쳐줘” | 영상 오버레이와 노출 구간 배치 | 가져온 영상, 필요하면 표본 프레임 확인 |
| “자막을 고치고 크게 해줘” | 자막 항목 생성·문구·노출 시간·스타일 수정 | 자막 텍스트와 시각 정보 |
| “두 컷 사이에 디졸브를 넣어줘” | 인접 클립 전환 추가 | 유효한 클립 경계·길이 |
| “이 부분에 표시해줘” | 마커 추가 | 타임라인 위치 |
| “작업 전으로 되돌려줘” | 복구 지점으로 전체 프로젝트 복원 | 작업 시작 checkpoint ID |
| “저장하고 FHD 영상으로 뽑아줘” | 프로젝트 저장·영상 출력·완료 조회·취소 | 절대 파일 경로, 새 출력 파일명 |

- 상세 도구·명령·제한: [MCP 편집 범위 정의](./docs/02-mcp-editing.md)
- B-roll 분석은 최대 60초 구간의 최대 8개 이미지 표본. 전체 영상을 보거나 음성을 들은 것과 다름
- 자동 음성 전사·무음 감지 시작, SRT 파일 입출력, 재생 버튼 제어, 앱 설정 변경, 프로젝트 삭제는 현재 MCP에 전용 도구 없음
- 모델이 자료 없이 발화 내용이나 보지 않은 장면을 정확히 판단할 수는 없음
- 로컬에 없는 음악·영상의 다운로드나 생성은 MCP 기능에 포함되지 않음

## 복구 방법

| 상황 | 방법 | 주의점 |
| --- | --- | --- |
| 방금 한 편집 취소 | Cmd+Z / Edit → Undo | 수동 편집도 같은 이력에 포함 |
| 취소한 편집 다시 적용 | Shift+Cmd+Z / Redo | 새 편집 후에는 재실행 이력이 달라질 수 있음 |
| 여러 MCP 호출로 한 작업 전체 취소 | 작업 시작 create_checkpoint의 ID로 restore_checkpoint | 중간 자동 복구 지점과 구분 |
| 앱 재시작 후 MCP 작업 복구 | list_checkpoints로 찾거나 기록한 ID 사용 | 복구 후 파일 저장은 별도 |
| 화면 조작 작업 전체 취소 | 작업 전 Save As… 복사본 열기 | 화면 편집에는 MCP 자동 스냅샷 미적용 |

- 복구 직전 상태도 보관하므로 잘못된 MCP 복구를 다시 되돌릴 수 있음
- 원본 미디어·이미 출력한 MP4·앱 설정은 프로젝트 복구 대상에서 제외

## 단축키와 문제 해결

- Cmd+I: 가져오기, Cmd+S: 저장, Shift+Cmd+S: 다른 이름 저장
- Space: 재생/정지, ←/→: 한 프레임, Shift+←/→: 1초 이동
- Cmd+B: 분할, Delete: 삭제, Shift+Delete: Ripple Delete
- 텍스트 입력 중에는 단축키가 입력 필드에 작용할 수 있으므로 포커스 확인
- 미디어 누락: 원본 파일 경로 확인
- 출력 실패: Settings → Preview & Tools에서 ffmpeg 경로 확인
- 재생 지연: 미리보기 품질·프록시 설정 확인
- MCP 연결 실패: [연결 오류 안내](./docs/01-mcp-setup.md#연결-오류) 확인
