---
type: Reference
title: Piano Coach intent and architecture v0.3
description: The user's design document for this product, copied as given; goals, priorities, interfaces, data model and phase plan.
tags: [intent, architecture, omr, midi]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
---

# Piano Coach — Intent & Architecture v0.3

> 다른 구현 세션에 넘기는 의도·아키텍처 문서다. 결정마다 이유를 적었으니, 바꿀 때는 이유가 아직 유효한지 먼저 확인한다.
> v0.3 변경: 독립 검토(Fable 5.2) 반영, Gemini 제외, OMR을 LLM 기반으로 직접 구현, 공개 GitHub repo·비상업 방침 확정.
> 저장소 사본 메모: 제품 이름은 akbun-piano-teacher이고, 3장의 참조 codebase는 product/akbun-taskq다. 구현과 다른 점은 [../decisions/](../decisions/index.md)에 있다.

## 0. 목표와 방침

- 사용자: 본인 1명. 취미 피아노, 디지털 피아노(USB-MIDI), macOS + Windows
- 1차 목표: 곡 1개 완곡 → 끊김 없이 자연스럽게 연주
- 2차 목표: 악보를 보면서 실시간으로 연주(초견)
- 현재 상태: 악보를 한 번 보고 외워서 근육 기억으로 연주함. 악보를 보고 소리를 떠올리지 못함. 페달은 마디마다 밟음
- 연습 시간: 주말 1~2시간 → 세션 재개, 지난주 약한 마디 워밍업이 기본 흐름
- 배포: 공개 GitHub repo, 비상업. 기능을 먼저 구현하고, 상업화할 때는 9장 목록의 기능을 빼거나 바꾼다
- 비목표: 강약 표현 교정, 다중 사용자, 상업 배포, 3D 아바타

## 1. 구현 우선순위 (사용자 지정)

1. 사진·PDF 악보 인식(OMR) → 악보 데이터 변환
2. 악보 재생 (소리 + 악보 커서 + 건반 표시)
3. 내 연주 시뮬레이션 (MIDI + 탑다운 카메라 영상을 기록하고 다시 재생)
4. 교정 (틀린 음·멈춘 곳·템포 판정, 틀린 부분을 내 연주와 정답으로 나란히 무한 반복)

순서는 지키되, OMR 품질이 재생·교정 개발을 멈추지 않도록 MusicXML·MIDI 가져오기를 OMR보다 먼저 완성한다. 재생·교정은 가져온 MusicXML로 개발·검증할 수 있다.

## 2. 핵심 결정

| 결정 | 내용 | 이유 |
|---|---|---|
| 앱 형태 | 데스크톱 앱, Electron + TypeScript | Tauri(macOS WKWebView)는 Web MIDI 미지원·카메라 권한 이슈 이력, Node가 없어 LLM SDK 사용에 별도 프로세스 필요. 필요한 라이브러리가 JS 생태계에 있음 |
| 기능 추상화 | 기능은 인터페이스(port)로 정의, 구현은 adapter. 구현이 2개 이상인 기능만 설정에서 선택 | LLM 정책·모델이 자주 바뀜. 구현이 1개뿐인 기능까지 선택 UI를 두면 과함 |
| LLM | Claude = API 키, OpenAI = ChatGPT 구독(Codex). 모델 ID는 설정값. Gemini 제외 | 사용자 결정. 새 모델이 나오면 설정만 바꿈 |
| OMR | LLM 비전 기반 파이프라인을 직접 구현. Audiveris는 선택 adapter(외부 설치)이자 평가 기준선 | 허용 라이선스의 기성 피아노 OMR이 없음. 직접 쓴 코드는 라이선스 제약이 없음 |
| LLM 출력 형식 | MusicXML을 직접 생성시키지 않고 마디별 짧은 표기 문자열(4.4장) → 파서 → Score | 형식이 짧을수록 덜 틀리고, 틀린 출력은 코드가 걸러냄 |
| 판정 주체 | 규칙 기반 코드(MIDI 기준) | 틀린 음·멈춤·템포는 MIDI로 정확히 계산 가능. LLM은 해설만, 판정값을 바꾸지 못함 |
| 내 모습 재현 | 녹화한 내 영상을 MIDI 시각으로 잘라 재생 + MIDI로 건반 재현 | 3D 아바타보다 구현 비용이 낮고 실제 손 모습이 그대로 남음 |
| 손가락 시연 | 2D 건반 + 손가락 번호 | 3D는 비목표 |
| 카메라 | v1 탑다운 1대, 측면은 자세 교정 단계에서 추가 | 손가락→건반 매핑은 탑다운이 필요 |
| 라이선스 | repo 자체는 MIT(제안). 앱 번들은 MIT/BSD/Apache/CC-BY만. GPL·AGPL 도구는 사용자가 따로 설치하고 외부 프로세스로 실행 | 공개 repo를 허용 라이선스로 유지 |
| 저장 | 로컬 JSON 파일 | 가독성·디버깅 우선 |

## 3. 공통 인프라 (사용자의 다른 codebase 참조)

아래 4개는 사용자가 다른 codebase에 구현해 둔 것을 가져온다. 이 문서에서는 접점만 정의한다.

- 참조 codebase 경로: product/akbun-taskq

| 항목 | 이 앱에서 쓰는 곳 |
|---|---|
| auto compaction | LLM 코칭 대화(리포트 후속 질문)의 컨텍스트 압축 |
| 현재 사용량 | Claude API 토큰·비용, Codex 구독 한도 |
| 백그라운드 task | OMR, 영상 remux, 분석, LLM 호출 |
| 진행 상황 | OMR 단(system) 진행률, 분석 단계, LLM 응답 |

백그라운드 task의 진행 상황 접점:

```ts
type TaskProgress = {
  stage: string
  ratio?: number
  message?: string
}

type TaskContext = {
  signal: AbortSignal
  progress(p: TaskProgress): void
  log(level: 'info' | 'warn' | 'error', message: string): void
}
```

## 4. OMR (사진·PDF → 악보)

### 4.1 근거와 가정

- OpenAI 발표 기준 GPT-6 Astra가 OpenScore String Quartets OMR에서 0.84(1 − OMR-NED)를 기록했다. 현악 4중주(보표당 단선율) 결과라 피아노(큰보표, 화음, 다성부) 성능은 알 수 없다. 기호 약 16% 오류 수준이면 오류 없는 마디 비율은 높지 않을 수 있다
- Claude 모델의 OMR 공개 수치는 없다
- 따라서 가정: "LLM OMR은 피아노에서 쓸 만할 수 있다. 직접 측정해서 판단한다". 측정 전에는 OMR을 다른 기능의 선행 조건으로 두지 않는다

### 4.2 파이프라인

입력부터 저장까지의 단계:

```text
입력(PDF/사진)
→ 페이지 이미지화 (pdfjs-dist, 사진은 EXIF 회전)
→ 보정 (기울기, 대비)
→ 단 분할 (오선 가로 투영으로 단 위치 검출, 큰보표는 위·아래 보표를 함께 자름)
→ 마디선 검출 (세로선 검출로 단별 마디 수 계산)
→ 단마다 VisionLlm 호출 (단 이미지 + 음자리표·조표·박자표·직전 마디 임시표 문맥)
→ 파서 (4.4 표기 → 단 단위 Score 조각)
→ 검증 (4.5)
→ 실패·불일치 마디만 확대 이미지로 재인식 (최대 2회)
→ 병합 (단 → 페이지 → 곡, 단 경계 붙임줄 연결)
→ Score + 마디별 출처 정보 → 검토·편집 화면 → MusicXML 저장
```

- 단·마디 위치는 LLM 좌표에 맡기지 않는다. 이미지 처리로 구하고, LLM이 출력한 마디 수와 대조한다
- 벡터 PDF는 pdf.js로 오선·글리프 좌표를 직접 뽑을 수 있는지 P0에서 확인한다. 되면 단·마디 분할에 쓴다
- 단 이미지는 모델 입력 한도 안에서 최대 크기로 보내고, 축소 여부를 로그로 남긴다

### 4.3 VisionLlm 구현

| 구현 | 라이브러리 | 인증 | 실행 조건 |
|---|---|---|---|
| CodexVision | @openai/codex-sdk (codex 바이너리, JSONL) | ChatGPT 로그인(`codex login`) | 이미지 입력 + outputSchema 사용. 읽기 전용 샌드박스, 빈 작업 디렉터리 |
| ClaudeApiVision | @anthropic-ai/sdk | ANTHROPIC_API_KEY (Electron safeStorage) | 이미지 입력 + JSON 스키마 출력 |

- Codex는 코딩 에이전트라 호출마다 에이전트 턴이 돈다. P0에서 4쪽 곡 기준 소요 시간·한도 소모를 측정한다
- 같은 VisionLlm 인터페이스를 코칭(6.5)에도 쓴다

### 4.4 LLM 출력 표기 (piano-notation v1)

단 1개 → JSON 1개. 마디 → 보표 → 성부 → 이벤트 문자열.

```json
{
  "system": 3,
  "measureCount": 4,
  "measures": [
    {
      "number": 12,
      "attributes": [],
      "staves": {
        "1": { "1": "E5/q D5/8 C5/8 D5/h", "2": "C5/h~ C5/h" },
        "2": { "1": "C3/q G3/q [E4+G4]/h" }
      },
      "barline": "regular",
      "uncertain": false
    }
  ]
}
```

| 요소 | 표기 | 예 |
|---|---|---|
| 음 | 음이름 + 적힌 임시표 + 옥타브 | `C4`, `F#4`, `Bb3`, `En4`(제자리표가 인쇄된 경우) |
| 화음 | 대괄호 + `+` | `[C4+E4+G4]/q` |
| 쉼표 | `r` | `r/q` |
| 길이 | `/w /h /q /8 /16 /32`, 점 `.`, 겹점 `..` | `D5/8.` |
| 붙임줄 시작 | 끝에 `~` | `C5/h~` |
| 잇단음 | `{실제:대체 ...}` | `{3:2 C5/8 D5/8 E5/8}` |
| 꾸밈음 | `g:` 접두 | `g:D5/16 C5/q` |
| 운지(있으면) | `@번호` | `E5@3/q` |
| 속성 변경 | `attributes` 배열 | `"clef:2:F"`, `"key:-1"`, `"time:3/4"`, `"8va:1:start"` |
| 마디선 | `barline` | `regular`, `double`, `final`, `repeat-start`, `repeat-end` |
| 도돌이·점프 | `attributes` | `"volta:1"`, `"ds"`, `"coda"`, `"fine"` |
| 확신 없음 | `uncertain: true` | 모델이 판독을 확신하지 못한 마디 |

- 음높이는 "악보에 적힌 음 + 인쇄된 임시표"로 받는다. 조표 적용과 마디 안 임시표 지속은 코드가 처리한다
- 같은 표기를 사람이 편집하는 포맷으로도 쓴다(4.6)

### 4.5 검증

| 검사 | 잡는 오류 | 방법 |
|---|---|---|
| 형식 | 파싱 실패 | 파서 오류 → 해당 단 재인식 |
| 박자 합계 | 길이 오류 | 성부마다 길이 합 = 박자표 길이. 첫 마디가 짧으면 못갖춘마디로 표시 |
| 마디 수 | 마디 누락·중복 | 마디선 검출 결과와 measureCount 비교 |
| 이중 판독 | 음높이 오류 | 같은 단을 2번 읽음(다른 배율·자르기, 또는 다른 모델). 불일치 마디만 표시·재인식 |
| 렌더 비교 | 모든 종류 | 인식 결과를 OSMD로 그려 원본 마디 이미지 옆에 배치. 검토 화면에서 사람이 비교 |
| 귀 검수 | 모든 종류 | 마디를 눌러 재생 |
| 음역 | 극단적 오류 | 보표별 음역 밖 음 표시 |

- 박자 합계는 음높이 오류를 잡지 못한다. 음높이는 이중 판독·렌더 비교·귀 검수로 잡는다

### 4.6 검토·편집 (P1에 포함)

- 화면: 왼쪽 원본 마디 이미지, 오른쪽 인식 결과 렌더, 마디마다 상태 색(통과/불일치/검증 실패/사용자 수정)
- 편집: 음 선택 후 음높이 ±반음·±옥타브, 길이 변경, 음 추가·삭제, 마디 표기 문자열 직접 수정
- 사용자가 고친 마디는 재인식해도 덮어쓰지 않는다

### 4.7 캐시

- 키: (단 이미지 해시, VisionLlm id, 모델 ID, 프롬프트 버전)
- 같은 키는 다시 호출하지 않는다. 구독 한도·비용을 아끼고 결과를 재현할 수 있게 한다

### 4.8 평가 (P0, 구현 전 go/no-go)

- 정답 세트
  - 공개: 저작권이 끝난 피아노곡 MusicXML(OpenScore 등, 곡별 라이선스 확인)을 렌더링해 PDF·정답 쌍 생성 → repo에 커밋 가능
  - 개인: 목표 곡 2~3개를 손으로 교정한 정답 → 저작권이 있으므로 `test-data/private/`(gitignore)에만 둠
- 지표: 마디 완전 일치율, 음높이 F1, 시작 시각 F1, 4쪽 곡 처리 시간, 비용·한도 소모
- 비교 대상: CodexVision, ClaudeApiVision, Audiveris(기준선, 개발자 PC에 설치)
- 판정(초기값, 측정 후 조정)
  - go: 한 모델 이상이 개인 정답 세트에서 마디 완전 일치율 70% 이상, 4쪽 곡 10분 이내
  - no-go: OMR은 보조 기능으로 두고, 주 입력은 MusicXML 가져오기(외부 악보 프로그램에서 입력)와 앱 내 편집
- 평가는 앱 UI 없이 `scripts/omr-eval`(Node)로 먼저 돌린다

## 5. 기능 인터페이스와 구현

### 5.1 원칙

- 인터페이스는 `packages/core/src/ports/`. Electron·React를 import하지 않는다
- 구현은 `adapters/<기능>/<구현명>`
- 구현이 2개 이상인 기능(VisionLlm, OmrEngine, CameraRecorder)만 Registry와 설정 선택을 둔다
- 외부 도구·로그인·키가 필요한 구현은 `available()`로 상태를 알린다

외부 도구 상태 타입:

```ts
type Availability =
  | { ok: true }
  | { ok: false; reason: 'not-installed' | 'not-logged-in' | 'no-api-key' | 'unsupported-os'; hint: string }
```

### 5.2 기능 목록

| 인터페이스 | 구현 | 설정 선택 | 단계 |
|---|---|---|---|
| ScoreImporter | MusicXmlImporter(.musicxml/.mxl), MidiImporter | X | P1-a |
| VisionLlm | CodexVision, ClaudeApiVision | O | P0 |
| OmrEngine | LlmOmr, AudiverisOmr(선택, 외부 설치) | O | P1-b |
| ScoreRenderer | OsmdRenderer | X | P1 |
| Synth | ToneSampler | X | P1(마디 재생), P2 |
| Player | TimelinePlayer | X | P2 |
| MidiInput | WebMidiInput | X | P3 |
| CameraRecorder | MediaRecorderCamera, FfmpegCamera | O | P3 |
| Analyzer | RuleAnalyzer | X | P4 |
| FingeringEngine | MusicXmlFingering, PianoPlayerPort(MIT 이식) | 이후 | P7 |
| HandTracker | MediaPipeHandTracker | X | P7 |

### 5.3 인터페이스 정의

기능별 port 정의:

```ts
type VisionRequest = {
  system: string
  prompt: string
  images: string[]
  jsonSchema?: object
}

type VisionResult = {
  text: string
  json?: unknown
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number }
}

interface VisionLlm {
  id: string
  modelId: string
  available(): Promise<Availability>
  complete(req: VisionRequest, ctx: TaskContext): Promise<VisionResult>
}

type OmrInput =
  | { kind: 'pdf'; path: string }
  | { kind: 'images'; paths: string[] }

type MeasureOrigin = {
  measureNumber: number
  page: number
  bbox: { x: number; y: number; w: number; h: number }
  status: 'ok' | 'disagree' | 'invalid' | 'uncertain' | 'user-edited'
  attempts: number
  notation: Record<string, Record<string, string>>
}

type OmrResult = {
  score: Score
  origins: MeasureOrigin[]
  pageImages: string[]
}

interface OmrEngine {
  id: string
  available(): Promise<Availability>
  recognize(input: OmrInput, outDir: string, ctx: TaskContext): Promise<OmrResult>
}

interface ScoreImporter {
  extensions: string[]
  import(path: string): Promise<Score>
}

interface Synth {
  load(ctx: TaskContext): Promise<void>
  noteOn(pitch: number, velocity: number, atMs?: number): void
  noteOff(pitch: number, atMs?: number): void
  stopAll(): void
}

type PlayerPosition = {
  timelineMs: number
  measure: number
  beat: number
  activeNoteIds: string[]
}

interface Player {
  load(score: Score): void
  play(): void
  pause(): void
  seekMeasure(measure: number): void
  setTempoScale(scale: number): void
  setLoop(range: { fromMeasure: number; toMeasure: number } | null): void
  setHands(hands: Hand[]): void
  setMetronome(on: boolean): void
  onPosition(listener: (p: PlayerPosition) => void): () => void
}

interface MidiInput {
  listDevices(): Promise<{ id: string; name: string }[]>
  open(deviceId: string): Promise<void>
  onEvent(listener: (e: MidiEvent) => void): () => void
  close(): Promise<void>
}

interface CameraRecorder {
  id: string
  available(): Promise<Availability>
  listDevices(): Promise<{ id: string; name: string }[]>
  start(deviceId: string): Promise<{ startedAtMs: number }>
  stop(outPath: string, ctx: TaskContext): Promise<{ path: string; durationMs: number }>
}

interface Analyzer {
  analyze(score: Score, session: Session, config: AnalysisConfig): Report
}
```

## 6. 데이터 모델과 단계별 상세

### 6.1 Score 모델 (`packages/core/src/model`)

악보 모델:

```ts
type Hand = 'L' | 'R'

type Pitch = {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
  alter: -2 | -1 | 0 | 1 | 2
  octave: number
  midi: number
}

type NoteEvent = {
  id: string
  kind: 'note' | 'rest'
  measure: number
  staff: 1 | 2
  voice: number
  startTick: number
  durationTick: number
  pitches: Pitch[]
  tieStart?: boolean
  tieStop?: boolean
  tuplet?: { actual: number; normal: number }
  grace?: boolean
  finger?: (1 | 2 | 3 | 4 | 5)[]
  hand: Hand
}

type Measure = {
  number: number
  startTick: number
  lengthTick: number
  isPickup: boolean
  key: number
  time: { beats: number; beatType: number }
  clefs: Record<1 | 2, 'G' | 'F'>
  octaveShift?: Record<1 | 2, number>
  barline: 'regular' | 'double' | 'final' | 'repeat-start' | 'repeat-end'
  volta?: number
  jump?: 'ds' | 'dc' | 'coda' | 'fine' | 'segno'
}

type Score = {
  id: string
  title: string
  source: 'musicxml' | 'midi' | 'omr'
  ticksPerQuarter: number
  tempoMap: { tick: number; bpm: number }[]
  measures: Measure[]
  events: NoteEvent[]
  pedal?: { tick: number; down: boolean }[]
}

type TimelineNote = {
  eventId: string
  playIndex: number
  measure: number
  pitch: number
  startMs: number
  durationMs: number
  hand: Hand
  finger?: number
}
```

- `Score`는 악보에 적힌 그대로의 구조다. 재생·정렬은 도돌이·점프를 펼치고 붙임줄을 합친 `TimelineNote[]`를 쓴다(`packages/core/src/timeline`)

### 6.2 기록·분석 모델

연주 기록과 분석 결과 모델:

```ts
type MidiEvent = {
  tMs: number
  kind: 'on' | 'off' | 'pedal'
  pitch?: number
  velocity?: number
  value?: number
}

type Session = {
  id: string
  scoreId: string
  startedAt: string
  tempoScale: number
  range: { fromMeasure: number; toMeasure: number }
  hands: Hand[]
  events: MidiEvent[]
  videoPath?: string
  videoStartedAtMs?: number
  videoOffsetMs: number
}

type Mistake = {
  measure: number
  beat: number
  kind: 'wrong' | 'missed' | 'extra' | 'hesitation' | 'rush' | 'drag'
  expected: number[]
  played: number[]
  clip: { fromMs: number; toMs: number }
}

type Report = {
  sessionId: string
  accuracy: number
  completedWithoutStop: boolean
  hesitations: number
  tempoCurve: { measure: number; bpm: number }[]
  mistakes: Mistake[]
  weakMeasures: number[]
  suggestedLoops: { fromMeasure: number; toMeasure: number; tempoScale: number }[]
}

type AnalysisConfig = {
  chordWindowMs: number
  hesitationRatio: number
  hesitationMinMs: number
  tempoDeviation: number
  localTempoWindow: number
}
```

기본값: `chordWindowMs=50, hesitationRatio=2.0, hesitationMinMs=600, tempoDeviation=0.15, localTempoWindow=8`

### 6.3 단계

#### P0. PoC + OMR 측정

- Electron Web MIDI 입력 (macOS·Windows)
- getUserMedia + MediaRecorder 녹화, 저장 파일 seek
- OSMD 커서 단위(voice entry)와 TimelineNote 매핑
- CodexVision: 이미지 입력·outputSchema·소요 시간·한도 소모, ClaudeApiVision: 이미지 입력·비용
- 벡터 PDF에서 pdf.js로 오선·글리프 좌표 추출 가능 여부
- `scripts/omr-eval`로 4.8 평가 → go/no-go 기록
- 완료 기준: 위 항목 결과를 `docs/poc-results.md`에 기록

#### P1. 악보 변환

- P1-a 가져오기: MusicXML(.musicxml/.mxl)·MIDI → Score, 라이브러리 저장, 악보 렌더, 마디 재생
- P1-b OMR: 4.2 파이프라인, 4.6 검토·편집, 4.7 캐시
- 완료 기준: 공개 정답 세트 곡 1개를 OMR → 검토·편집 → 정답과 일치하는 MusicXML로 저장

#### P2. 악보 재생

- 악보(OSMD) + 커서, 건반(Canvas, 88건), 떨어지는 노트(선택)
- 재생/정지, 마디 이동, 속도 0.25~1.5, A-B 구간 무한 반복, 손 분리, 메트로놈
- 건반 색: 오른손·왼손 구분, 지금 치는 음 강조, 손가락 번호 표시
- 재생 소리는 앱 샘플러, 사용자가 치는 소리는 디지털 피아노
- 완료 기준: 첫 8마디를 0.5x로 반복 재생할 때 커서·건반이 소리와 일치

#### P3. 내 연주 시뮬레이션

- MIDI 이벤트 + 탑다운 카메라 영상 동시 기록. 시각 기준은 renderer의 `performance.now()`
- 동기화 보정: `videoOffsetMs` 수동 슬라이더, 이후 "C4를 3번 치기" 자동 보정
- 영상 후처리: webm seek 개선을 위해 ffmpeg remux(`-c copy`), ffmpeg가 없으면 ts-ebml로 메타데이터 보정
- 재생 화면: 내 영상 + 내 MIDI 건반 + 악보 커서를 같은 시각으로, 속도 조절, 구간 무한 반복
- 완료 기준: 영상과 건반 재생 시점 차이 100ms 이하

#### P4. 교정

- RuleAnalyzer
  1. TimelineNote를 화음 그룹 시퀀스로, 연주 note-on을 `chordWindowMs` 창으로 묶어 그룹 시퀀스로 만듦
  2. Needleman-Wunsch 정렬. 비용 = pitch 집합 차이 + 정규화한 시간 차이
  3. ok / wrong / missed / extra 판정
  4. 국소 템포 = 최근 `localTempoWindow`개 그룹 선형 회귀
  5. 멈춤 = 음 간격 > 예상 간격 × `hesitationRatio` 이고 > `hesitationMinMs`
  6. rush·drag = 국소 템포가 목표 대비 ±`tempoDeviation` 초과
- 리포트 화면: 정확도, 멈춤 횟수, 템포 곡선, 틀린 마디 목록, 다음 연습 구간
- 비교 재생 화면: 왼쪽 내 연주(영상 + 건반, wrong=빨강, missed=회색), 오른쪽 정답(건반 + 손가락 번호 + 악보 커서). 틀린 위치 앞뒤 1마디를 구간으로 무한 반복, 속도 0.25/0.5/0.75/1.0
- 완료 기준: 틀린 음 3개, 멈춤 1회를 일부러 넣은 연주에서 모두 검출

#### P5. LLM 코칭 (VisionLlm 재사용)

| 기능 | 입력 | 출력 |
|---|---|---|
| 리포트 해설 | Report JSON + 해당 마디 음 목록 | 한국어 피드백 + 다음 주 할 일 3개 (JSON 스키마) |
| 후속 질문 | 리포트 + 대화 | 답변 (auto compaction 적용) |
| 자세 코멘트 | 틀린 구간 영상의 2fps 프레임 | 손목·손가락 코멘트 |

#### 이후 단계

- P6 연습 모드: wait 모드(맞는 음을 누를 때까지 커서 대기), 가이드 4단계

  | 단계 | 악보 | 커서 | 건반 표시 | 소리 | 진행 |
  |---|---|---|---|---|---|
  | 1 | O | O | O | 재생 | 자동 |
  | 2 | O | O | O | 없음 | wait |
  | 3 | O | O | X | 없음 | wait |
  | 4 | O | X | X | 메트로놈 | 템포 |

  단계 상승: 같은 구간 정확도 95% 이상, 멈춤 0회로 2회 연속
- P7 운지·자세: PianoPlayerPort, MediaPipe 손 추적 운지 판정, 측면 카메라, 페달(CC64) 교정
- P8 초견 훈련

## 7. 화면 목록

1. 라이브러리: 곡 목록, 가져오기(PDF/사진/MusicXML/MIDI), 지난 세션, 이어서 연습
2. OMR 검토·편집
3. 연습(재생·녹음)
4. 내 연주 재생
5. 리포트
6. 비교 재생
7. 설정: MIDI 장치, 카메라, VisionLlm·OmrEngine·CameraRecorder 구현 선택, 모델 ID, API 키, 외부 도구 경로(codex, ffmpeg, Audiveris), 사용량

## 8. 기술 스택

| 영역 | 선택 | 라이선스 |
|---|---|---|
| 앱 | Electron, electron-vite | MIT |
| UI | React + TypeScript, Zustand | MIT |
| 악보 렌더 | OpenSheetMusicDisplay (자체 Player 사용, OSMD 오디오 기능은 쓰지 않음) | BSD-3 (P0에서 재확인) |
| PDF | pdfjs-dist | Apache-2.0 (P0에서 재확인) |
| 재생 | Tone.js + Salamander Grand Piano 샘플 | MIT / CC-BY 3.0 (출처 표기) |
| MIDI 파일 | @tonejs/midi | MIT |
| MIDI 입력 | Web MIDI API | – |
| 영상 | getUserMedia, MediaRecorder, ts-ebml | – / MIT |
| LLM | @anthropic-ai/sdk, @openai/codex-sdk | 각 SDK 라이선스 |
| OMR 기준선 | Audiveris (외부 설치, 선택) | AGPL-3.0, 번들 금지 |
| 영상 remux | ffmpeg (외부 설치, 선택) | LGPL/GPL, 번들 금지 |
| 테스트 | vitest | MIT |

## 9. 상업화할 때 빼거나 바꿀 것

| 대상 | 이유 | 조치 |
|---|---|---|
| CodexVision (ChatGPT 구독) | Sign in with ChatGPT 약관: 플랜 사용을 유료 기능으로 묶을 수 없음 | 무료 기능으로만 두거나 OpenAI API 키 구현으로 교체 |
| AudiverisOmr | AGPL-3.0 | adapter 제거 |
| 악보 파일 공유·동봉 | 현대곡 악보는 저작물 | 해당 기능을 만들지 않음 |
| Salamander 샘플 | CC-BY 3.0 | 출처 표기 유지(제거 불필요) |

## 10. 저장 구조와 repo 위생

사용자 데이터 디렉터리 구조:

```text
~/PianoCoach/
  library/<songId>/
    source/            # 원본 PDF·사진
    score.musicxml
    score.json
    omr/               # 단 이미지, 마디 출처, 캐시
    practice-state.json
    sessions/<timestamp>/
      session.json
      report.json
      video.webm
  config/
    settings.json
    analysis.json
```

- 공개 repo에 커밋하지 않는 것: 사용자 라이브러리, 저작권 있는 악보·정답 데이터(`test-data/private/`), API 키
- API 키는 OS 키체인(Electron safeStorage)에만 저장
- `THIRD_PARTY_LICENSES.md`에 의존성 라이선스와 Salamander 출처 기록

## 11. 디렉터리

제안된 저장소 구조:

```text
piano-coach/
  apps/desktop/
    src/main/
      registry/
      tasks/                  # 참조 codebase의 백그라운드 task·진행 상황 연결
      adapters/
        vision/codex/
        vision/claude-api/
        omr/llm/
        omr/audiveris/
        camera/ffmpeg/
      library/
    src/preload/
    src/renderer/
      adapters/
        midi/web-midi/
        camera/media-recorder/
        synth/tone-sampler/
        renderer/osmd/
      features/
        library/ omr-review/ practice/ replay/ report/ compare/ settings/
      components/
        Keyboard/ ScoreView/ FallingNotes/ VideoLoop/ MeasureCompare/
  packages/core/
    src/model/
    src/ports/
    src/notation/             # piano-notation v1 파서·직렬화
    src/omr/                  # 단 분할, 검증, 병합 (이미지 처리 포함, UI 비의존)
    src/musicxml/
    src/timeline/
    src/analysis/
  scripts/
    omr-eval/
  test-data/
    public/                   # 저작권 끝난 곡 정답 세트
    private/                  # gitignore
  docs/
    poc-results.md
  LICENSE
  THIRD_PARTY_LICENSES.md
```

## 12. 리스크

| 리스크 | 대응 |
|---|---|
| 피아노 OMR 정확도 미확인 | P0 평가로 go/no-go. no-go면 MusicXML 가져오기 + 편집을 주 입력으로 |
| 음높이 오류가 검증을 통과 | 이중 판독, 렌더 비교, 귀 검수, 편집 기능 |
| Codex 에이전트 오버헤드·한도 | P0 측정, 캐시, 실패 마디만 재인식 |
| Codex 구독 호출 정책 변경 | VisionLlm 뒤에서 구현만 교체 |
| Claude API 비용 | 사용량 표시, 캐시 |
| OSMD 커서와 타임라인 매핑 | P0 PoC |
| MediaRecorder 포맷·seek | P0 PoC, remux |

## 13. 코드 규칙

- indent 2
- 의미 없는 주석 금지, 필요한 주석만
- 읽기 쉽고 유지보수 쉬운 코드가 1순위, 영리한 코드는 2순위
- `packages/core`는 Electron·React를 import하지 않음. notation 파서, 검증, timeline, 정렬은 단위 테스트 필수 (vitest)
- 새 기능은 인터페이스(`ports/`)를 먼저 정의하고 구현(`adapters/`)을 붙임
- 새 의존성은 라이선스를 THIRD_PARTY_LICENSES.md에 기록, GPL/AGPL은 번들 금지
- 저작권 있는 악보·데이터는 커밋 금지
