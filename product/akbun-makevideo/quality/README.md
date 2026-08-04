# 재생 품질 계측

media element 재생과 이후 엔진을 같은 수치로 비교하는 하네스다.

## 지표

- 프레임 표시 간격 p50
- 프레임 표시 간격 p99
- 드랍 프레임 수와 비율
- 오디오·영상 타임라인 시각 차이 p99
- 재생 요청부터 첫 프레임까지의 지연 p99
- 앱과 webview 자식 프로세스의 분당 RSS 증가량

30 fps 기본 합격 기준은 다음과 같다.

| 지표 | 기준 |
|---|---:|
| 프레임 간격 p50 | 42 ms 이하 |
| 프레임 간격 p99 | 67 ms 이하 |
| 드랍 프레임 비율 | 0.1% 이하 |
| A/V drift p99 | 50 ms 이하 |
| 시작 지연 p99 | 500 ms 이하 |
| RSS 증가 | 64 MiB 이하 |

## 측정 소재 준비

- 1080p30 색 패턴과 번인 타임코드 영상 생성
- 1 kHz 오디오 포함
- 기본 길이 10분
- 생성물은 `/tmp/akbun-makevideo-quality`에 저장
- 대용량 영상은 저장소에 저장하지 않음

합성 영상과 4개 영상·오디오 트랙 프로젝트를 생성한다.

```bash
cd product/akbun-makevideo/workspace
npm run quality:media
```

짧은 하네스 점검에는 영상 길이를 줄인다.

```bash
DURATION_SECONDS=30 npm run quality:media
```

## 실행

1. 개발 앱 실행
2. `/tmp/akbun-makevideo-quality/project.akbunvideo` 열기
3. Settings 메뉴에서 Playback Quality Soak 실행
4. 저장 대화상자에서 JSON 보고서 경로 선택

전체 soak를 실행하고 보고서를 저장한다.

```js
await makevideoQuality.runAndSave()
```

같은 실행은 Settings → Playback Quality Soak에서도 시작할 수 있다.

빠른 동작 점검은 각 구간을 줄여 실행한다.

```js
await makevideoQuality.runAndSave({
  continuousMs: 5000,
  restartCount: 2,
  restartPlayMs: 1000,
  restartPauseMs: 100,
  trackStepMs: 1000,
  seekCount: 3,
  seekIntervalMs: 300,
})
```

같은 점검은 Settings → Playback Quality Smoke에서도 시작할 수 있다.

## 자동 실행

환경변수로 프로젝트 열기와 보고서 저장을 자동화할 수 있다.

```bash
AKBUN_MAKEVIDEO_QUALITY_PROJECT=/tmp/akbun-makevideo-quality/project.akbunvideo \
AKBUN_MAKEVIDEO_QUALITY_REPORT=/tmp/media-element.json \
npm start
```

하네스 자체를 빠르게 점검한다.

```bash
AKBUN_MAKEVIDEO_QUALITY_PROJECT=/tmp/akbun-makevideo-quality/project.akbunvideo \
AKBUN_MAKEVIDEO_QUALITY_REPORT=/tmp/media-element-smoke.json \
AKBUN_MAKEVIDEO_QUALITY_SMOKE=1 \
npm start
```

## 시나리오

- `continuous-playback`: 기본 5분 연속 재생
- `stop-and-restart`: 10회 정지·재시작
- `increasing-track-count`: 영상·오디오 활성 트랙을 1개에서 4개까지 증가
- `repeated-seek`: 재생 중 20회 seek

## 프레임 소스 공급 계측

엔진 단계의 프레임 공급만 따로 재는 헤드리스 하네스다. 창을 띄우지 않고 [frame-source](../wiki/architecture/frame-source.md)에서 목표 fps로 프레임을 꺼내며, 한 시나리오라도 기준을 넘기면 종료 코드가 0이 아니다.

```bash
cd product/akbun-makevideo/workspace
npm run quality:supply -- /tmp/akbun-makevideo-quality/project.akbunvideo --seconds 30
```

주요 옵션은 `--depth`(클립당 선공급 프레임 수), `--lead`(디코더 선행 시작 프레임 수), `--preset`, `--seek-every`, `--report`다.

시나리오는 페이지 하네스와 이름을 맞춘다.

- `continuous-supply`: 연속 공급
- `repeated-seek`: 재생 중 반복 seek
- `increasing-track-count`: 보이는 영상 트랙을 2개부터 전체까지 증가

지표는 페이지 하네스와 같은 규칙으로 계산한다. 프레임 간격 p50·p99 기준값은 `ceil(1000/fps*1.25)`와 `ceil(1000/fps*2)`, 시작 지연 기준은 500 ms, 늦은 프레임 비율 기준은 0.1%다.

- `lateFrames`: 소스가 제때 내주지 못한 프레임 수. 하네스 자신의 sleep 오차와 seek 직후 재충전은 제외한다
- `lateByP99Ms`: 그 프레임들이 얼마나 늦었는지. 개수만으로는 4 ms 지연과 200 ms 지연이 구분되지 않음
- `supplyWaitP50Ms`, `supplyWaitP99Ms`: 소비자가 소스를 기다린 시간. 여유가 얼마나 남았는지를 먼저 보여주는 값
- `startupDelayP99Ms`: 재생 시작과 seek 직후 첫 프레임까지의 지연
- `peakBufferedBytes`: 큐가 실제로 들고 있던 최대 메모리. 기준값은 `(depth+1) * 프레임 크기 * 클립 수`라 구현이 자기 약속을 지키는지 검사한다

### 측정값

기본값(depth 6, lead 15)으로 1080p30 합성 소재를 시나리오당 30초씩 측정했다. 4코어 Linux 컨테이너 기준이며, macOS 기준선과 직접 비교하는 값은 아니다.

| 시나리오 | 영상 트랙 | 늦은 프레임 | 최대 지연 | 시작 지연 p99 | 간격 p99 | 최대 버퍼 |
|---|---:|---:|---:|---:|---:|---:|
| continuous-supply | 1 | 0 / 900 | - | 160 ms | 33.3 ms | 47 MiB |
| repeated-seek | 1 | 0 / 900 | - | 150 ms | 33.3 ms | 47 MiB |
| increasing-track-count | 2 | 0 / 900 | - | 159 ms | 33.3 ms | 95 MiB |
| increasing-track-count | 3 | 4 / 900 | 8 ms | 241 ms | 33.3 ms | 142 MiB |
| increasing-track-count | 4 | 7 / 900 | 49 ms | 283 ms | 33.3 ms | 190 MiB |

- 1~2 트랙은 전 항목 통과. 3~4 트랙은 늦은 프레임 비율 0.1%를 넘겨 실패
- 간격 p99가 모든 시나리오에서 프레임 주기 그대로라, 지연이 있어도 한 프레임을 넘기지 않았음
- depth를 2로 낮추면 연속 공급에서 900 프레임 중 126개가 늦음. 12로 올려도 6보다 나아지지 않아 기본값을 6으로 정함

## 기준선

- [media-element-macos.json](./media-element-macos.json)
- Apple M3 Pro의 macOS WebKit에서 2026-08-04 측정
- 5분 연속 재생: p50 33 ms, p99 69 ms, 8,983 표시 프레임 중 14 드랍
- 현재 경로의 상태를 고정한 비교 기준이며 합격 목표가 아님
- 이후 엔진은 동일 소재와 기본 설정으로 실행
- 절대 합격 기준과 media element 기준선 모두에 대해 회귀 여부 확인
