# AI 오디오 사용 가이드: 무음 제거와 SRT 만들기

대상 기능은 `akbun-makevideo` 0.43.0 이상이다. 가장 안전한 순서는 **프로젝트 저장 → 무음 제거 → 연결부 확인 → 자막 생성 → 자막 교정 → SRT 내보내기**다.

구조와 선택 이유가 필요하면 [AI audio 아키텍처와 의사결정](./ai-audio-architecture.md)을 먼저 읽는다.

## 시작 전 확인

- 타임라인에서 실제로 재생되는 비디오 또는 오디오 클립 준비
- 프로젝트 저장 또는 복사본 생성
- Settings → Preview & Tools에서 ffmpeg 감지 여부 확인
- ffmpeg가 없으면 macOS에서 `brew install ffmpeg` 실행 후 앱 재시작
- ffmpeg를 Homebrew 기본 경로가 아닌 곳에 설치했다면 Settings → Preview & Tools → ffmpeg binaries folder에 실행 파일이 든 폴더 지정

자막 생성과 무음 제거는 타임라인 전체의 들리는 오디오를 임시 mono 16 kHz MP3로 혼합해 분석한다. 원본 미디어 파일은 바꾸지 않는다.

## 권장 작업 순서

1. 기본값으로 무음 제거 실행
2. 잘린 연결부를 처음부터 끝까지 재생해 말머리와 말끝 확인
3. 너무 많이 잘렸으면 Undo 후 보수적인 값으로 다시 실행
4. 최종 타임라인에서 자막 생성
5. Captions 패널에서 시간과 문장 교정
6. Export SRT로 자막 파일 저장
7. 프로젝트 저장

무음 제거를 먼저 권장하는 이유는 제거할 구간까지 음성 API에 보내는 비용을 줄이고, 완성된 타임라인 기준으로 자막 시간을 만들기 위해서다. 자막을 먼저 만들었더라도 무음 제거가 자막을 포함한 모든 트랙을 같이 이동하므로 동기화는 유지된다.

## 음성 인식 공급자 설정

Settings → Preview & Tools → Speech recognition에서 설정하고 **Apply**를 누른다.

| 공급자 | Endpoint | Speech model | Session credential |
| --- | --- | --- | --- |
| OpenAI transcription | `https://api.openai.com/v1` | `whisper-1` | OpenAI API key |
| LiteLLM gateway | `http://127.0.0.1:4000/v1` | gateway에 등록한 음성 모델 이름 | gateway가 요구할 때만 입력 |
| Google Cloud Speech-to-Text | 화면의 `PROJECT_ID`를 실제 프로젝트 ID로 교체 | `long` | OAuth bearer token |
| Microsoft Azure Speech | 화면의 `YOUR_RESOURCE`를 실제 리소스 이름으로 교체 | `fast-transcription` | Azure Speech resource key |
| Custom OpenAI-compatible | gateway의 `/v1` 주소 | gateway의 음성 모델 이름 | gateway가 요구하는 키 |

Language는 한국어 기준 OpenAI 계열에 `ko`, Google·Azure에 `ko-KR`부터 사용한다.

반드시 구분할 점:

- Luna, Terra, Sol과 reasoning effort는 대화 AI 설정
- `whisper-1`, `long`, `fast-transcription`은 음성 인식 설정
- ChatGPT 구독은 OpenAI 음성 API 비용을 포함하지 않음
- Session credential은 앱을 닫을 때 사라지며 프로젝트와 설정 파일에 저장되지 않음
- LM Studio 단독 서버는 현재 음성 전사 endpoint를 제공하지 않으므로 LiteLLM 또는 실제 호환 gateway 필요
- OpenAI-compatible gateway는 `/audio/transcriptions`와 `start`/`end` 타임스탬프가 든 verbose JSON을 반환해야 함

## 자막을 생성하고 SRT로 저장

### 1. Captions 패널 열기

Edit → AI → Generate Captions…를 선택한다. 이 메뉴는 작업을 즉시 시작하지 않고 오른쪽 AI 패널의 Captions 화면을 연다.

### 2. 세션 자격증명 입력

Session credential에 현재 공급자의 키 또는 토큰을 입력한다.

- OpenAI, Google, Azure는 필수
- 인증을 사용하지 않는 로컬 LiteLLM과 Custom gateway는 비워도 됨
- 입력값은 앱이 종료될 때까지 해당 공급자의 메모리에만 보관
- Clear를 누르면 현재 공급자의 보관값 삭제

### 3. Generate captions 실행

Generate captions를 누르고 완료될 때까지 기다린다.

- 타임라인 전체 오디오 혼합
- 공급자 제한에 맞게 분할
- 타임스탬프가 있는 자막 생성
- 첫 번째 자막 트랙인 S1에 결과 삽입
- 자막 트랙이 없으면 자동 생성

주의: S1에 기존 자막이 있으면 새 결과로 전체 교체된다. 생성 작업 전체는 Undo 한 번으로 되돌릴 수 있다.

작업 중 Cancel 또는 Edit → AI → Cancel AI Edit를 누르면 적용 전 작업을 중단한다. 작업 중에는 타임라인을 편집하거나 다른 AI 오디오 작업을 동시에 시작하지 않는다.

### 4. 자막 교정

Captions 패널의 Timeline captions에서 각 항목을 수정한다.

- 왼쪽 시간: 시작 초
- 오른쪽 시간: 종료 초
- 본문: 화면에 표시할 문장
- Delete: 해당 자막 삭제

시간이나 문장을 바꾼 뒤 Tab을 누르거나 다른 입력칸을 클릭하면 반영된다. 종료 시간은 시작 시간보다 뒤여야 하며, 앱은 프로젝트 프레임 레이트에 맞춰 시간을 정렬한다.

### 5. SRT 파일 내보내기

타임라인 도구 모음의 **Export SRT**를 누르고 저장 위치를 선택한다. 기본 파일명은 `subtitles.srt`다.

내보내기 대상은 첫 번째 자막 트랙의 현재 자막 전체다. 시작 시간 순서로 번호와 타임스탬프를 다시 만들기 때문에 교정과 삭제를 마친 뒤 내보낸다.

저장 후 확인:

1. 텍스트 편집기로 SRT 파일 열기
2. 첫 자막과 마지막 자막의 시간 확인
3. 사용하는 영상 플레이어 또는 업로드 서비스에서 영상과 함께 재생

## 무음 제거

무음 제거는 외부 AI나 Session credential을 사용하지 않는다. 로컬 ffmpeg가 소리 크기를 분석하고 감지한 구간을 모든 비디오·오디오·자막 트랙과 마커에서 같은 길이만큼 제거한다.

### 기본 설정

Settings → Preview & Tools → Silence removal의 기본값:

| 설정 | 기본값 | 값을 바꿀 때의 효과 |
| --- | ---: | --- |
| Threshold | -35 dB | 0에 가까울수록 더 많은 소리를 무음으로 판단해 공격적으로 제거 |
| Minimum silence | 450 ms | 높을수록 긴 쉼만 제거해 보수적으로 동작 |
| Speech edge padding | 120 ms | 높을수록 말 앞뒤를 더 남겨 음절 잘림 감소 |

처음에는 기본값을 사용한다. 말머리가 잘리면 Undo 후 Threshold를 -40 dB 정도로 낮추거나 padding을 180~250 ms로 높인다. 의도한 호흡까지 사라지면 Minimum silence를 700~1,200 ms로 높인다. 한 번에 한 값만 바꿔 차이를 확인한다.

### 실행과 확인

1. 프로젝트 저장
2. Edit → AI → Remove Silence… 선택
3. Captions 패널에서 Remove silence 클릭
4. 완료 후 영상 처음부터 끝까지 재생
5. 모든 연결부의 말머리·말끝·화면 전환·자막 동기화 확인
6. 결과가 과하면 Undo 한 번 실행
7. 설정을 조정하고 다시 실행

현재 버전은 감지 구간 미리보기 없이 즉시 적용한다. 반드시 저장과 Undo를 복구 수단으로 두고 실행한다.

## 실패할 때 확인

| 증상 | 확인할 것 |
| --- | --- |
| ffmpeg가 필요하다는 오류 | Settings → Preview & Tools의 ffmpeg 경로와 앱 재시작 여부 |
| 타임라인이 비었거나 들리는 오디오가 없다는 오류 | 클립 존재, 음소거, 볼륨, 소스 범위 |
| Session credential 오류 | 현재 선택한 공급자에 맞는 키 또는 토큰인지 확인 |
| Google의 PROJECT_ID 오류 | Endpoint의 placeholder를 실제 프로젝트 ID로 교체 |
| Azure의 YOUR_RESOURCE 오류 | Endpoint의 placeholder를 실제 리소스 이름으로 교체 |
| 타임스탬프가 없다는 오류 | gateway가 verbose JSON segment의 `start`/`end`를 반환하는지 확인 |
| 다른 작업이 실행 중이라는 오류 | Render 또는 기존 AI 오디오 작업 완료 후 재시도 |
| 작업 취소 또는 타임라인 변경 오류 | 편집이 적용되지 않았는지 확인 후 다시 실행 |

오류와 취소는 부분 자막이나 일부 무음 제거를 남기지 않는다. 성공한 자막 생성과 무음 제거도 각각 Undo 한 번으로 복구할 수 있다.

## 개인정보와 비용

- 자막 생성: 임시 MP3를 선택한 음성 공급자에 전송
- 무음 제거: 오디오를 외부에 보내지 않고 로컬에서 처리
- 임시 MP3와 분할 파일: 작업 전용 임시 디렉터리에서 작업 종료 후 삭제
- API 비용: 각 음성 공급자 계정에 별도 청구
- credential: 현재 앱 세션 메모리에만 보관

## 구현 근거

- Edit → AI 메뉴와 Captions 패널: [index.html](../../akbun-makevideo/workspace/src/index.html):89,444-474
- 공급자와 무음 설정: [index.html](../../akbun-makevideo/workspace/src/index.html):626-656
- credential, 실행, 취소, 자막 교정: [ai-edit-panel.js](../../akbun-makevideo/workspace/src/ai-edit-panel.js):160-260
- 자막 생성과 S1 전체 교체: [ai_edit.rs](../../akbun-makevideo/workspace/src-tauri/src/ai_edit.rs):674-776,860-942
- 무음 감지와 전체 타임라인 적용: [ai_edit.rs](../../akbun-makevideo/workspace/src-tauri/src/ai_edit.rs):785-849,959-982
- SRT 내보내기 UI와 파일 생성: [renderer-timeline-ui.js](../../akbun-makevideo/workspace/src/renderer-timeline-ui.js):660-665, [commands.rs](../../akbun-makevideo/workspace/src-tauri/src/commands.rs):2070-2091
- Undo 가능한 전체 트랙 복구 스냅샷: [command.rs](../../akbun-makevideo/workspace/src-tauri/crates/edit/src/command.rs):2272-2306

## 스스로 확인할 질문

1. 무음 제거를 자막 생성보다 먼저 실행하면 어떤 비용과 시간 기준이 단순해지는가?
2. Threshold, Minimum silence, Speech edge padding 중 말머리 잘림을 줄이는 데 먼저 조정할 값은 무엇인가?
3. ChatGPT 구독 로그인과 OpenAI 음성 API key를 따로 준비해야 하는 이유는 무엇인가?
4. 자막 생성 전에 S1의 기존 자막을 확인해야 하는 이유는 무엇인가?
5. SRT를 내보내기 전에 어떤 세 가지를 직접 검수해야 하는가?
