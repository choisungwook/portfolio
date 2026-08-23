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

| 시나리오 | 영상 트랙 | 늦은 프레임 | 시작 지연 p99 | 간격 p99 | 최대 버퍼 |
|---|---:|---:|---:|---:|---:|
| continuous-supply | 1 | 0 / 900 | 160 ms | 33.3 ms | 47 MiB |
| repeated-seek | 1 | 0 / 900 | 150 ms | 33.3 ms | 47 MiB |
| increasing-track-count | 2 | 0 / 900 | 159 ms | 33.3 ms | 95 MiB |

- 1~2 트랙은 전 항목 통과. 간격 p99가 프레임 주기 그대로라 여유가 남은 상태
- depth를 2로 낮추면 연속 공급에서 900 프레임 중 126개가 늦음. 12로 올려도 6보다 나아지지 않아 기본값을 6으로 정함

3~4 트랙은 이 컨테이너에서 재현되지 않아 수치를 남기지 않는다.

- 같은 binary로 연속 실행한 두 번이 늦은 프레임 8개와 49개로 갈리고, 4트랙은 아예 첫 프레임이 2초 안에 오지 않아 중단되기도 함
- 1080p 디코더 4개가 4코어를 채우는 지점이라 측정 대상이 소스가 아니라 머신이 됨. 이 구간은 대상 머신에서 다시 재야 함

## 오디오 엔진 계측

엔진 단계의 소리만 따로 재는 헤드리스 하네스다. 출력 장치를 열지 않고 [audio](../wiki/architecture/audio.md)에서 버퍼 주기마다 512 프레임씩 꺼내며, 한 시나리오라도 기준을 넘기면 종료 코드가 0이 아니다.

```bash
cd product/akbun-makevideo/workspace
npm run quality:audio -- /tmp/akbun-makevideo-quality/project.akbunvideo --seconds 30
```

주요 옵션은 `--depth`(클립당 선공급 블록 수), `--lead`(디코더 선행 시작 샘플 수), `--seek-every`, `--report`다.

시나리오는 페이지 하네스와 이름을 맞춘다.

- `continuous-playback`: 연속 재생
- `repeated-seek`: 재생 중 반복 seek
- `increasing-track-count`: 들리는 오디오 트랙을 1개에서 4개까지 증가

지표는 다음과 같다.

- `underruns`: 링버퍼가 비어 콜백이 무음을 써야 했던 횟수. 사람이 클릭 소리로 듣는 유일한 실패라서 기준이 가장 엄격하다. 기준은 0.1%
- `silentFrames`: 그 구멍의 총 길이. 횟수만으로는 512 프레임과 5 프레임이 구분되지 않음
- `endedOnTheSample`: 타임라인을 끝까지 재생했을 때 마지막 샘플에 정확히 도달했는지. 한 샘플만 어긋나도 실패다. 밀리초가 아니라 샘플로 세는 이유 자체를 검사하는 값
- `driftMs`: 클럭과 벽시계의 차이. 영상이 이 클럭을 따라가므로 클럭이 세상보다 늦으면 영상도 늦는다. 기준은 재생 품질 기준표의 A/V drift와 같은 50 ms
- `ringLowWaterFrames`: 링버퍼가 가장 적게 들고 있던 양. 여유가 얼마나 남았는지를 먼저 보여주는 값
- `lateBlocks`: 디코더가 제때 내주지 못한 블록. 링버퍼가 흡수하므로 실패가 아니라 경고다
- `startupDelayP99Ms`: 재생 시작과 seek 직후 소리가 나기까지의 지연

seek 직후 재충전 시간은 `refillingMs`로 따로 빼고 underrun과 drift에서 제외한다. 클럭은 그동안 멈춰 있다가 옳은 자리에서 이어지므로 어긋남이 아니고, 이미 시작 지연으로 세고 있다. [계측 하네스는 자기 지연과 재시작 지연을 대상의 실패로 세지 않는다](../knowledge/decisions/2026-08-harness-does-not-count-its-own-delay.md)와 같은 규칙이다.

메모리 지표는 두지 않았다. 프레임 소스가 최대 버퍼를 재는 건 1080p 큐가 클립당 50 MB라 메모리가 버퍼 설정의 교환 대상이기 때문이고, 스테레오 1초는 384 KB라 같은 검사를 두면 절대 실패할 수 없는 검사가 된다.

### 측정값

기본값(depth 8, lead 24000)으로 1080p30 합성 소재를 시나리오당 20초씩 측정했다. Apple M3 Pro의 macOS 기준이다.

| 시나리오 | 오디오 트랙 | underrun | 시작 지연 p99 | 버퍼 간격 p99 | 링버퍼 최저 | drift |
|---|---:|---:|---:|---:|---:|---:|
| continuous-playback | 1 | 0 / 1875 | 48 ms | 13.2 ms | 2560 (53 ms) | 2.7 ms |
| repeated-seek | 1 | 0 / 1875 | 74 ms | 13.2 ms | 2560 (53 ms) | 15.1 ms |
| increasing-track-count | 2 | 0 / 1875 | 32 ms | 13.1 ms | 2560 (53 ms) | 2.0 ms |
| increasing-track-count | 3 | 0 / 1875 | 52 ms | 13.2 ms | 2560 (53 ms) | 1.6 ms |
| increasing-track-count | 4 | 0 / 1875 | 40 ms | 13.2 ms | 2560 (53 ms) | 0.8 ms |

- 4트랙까지 전 항목 통과. 프레임 소스가 같은 머신에서 3~4트랙을 재현하지 못했던 것과 달리 오디오는 여유가 남는다. 디코더가 그림을 건드리지 않기 때문이다
- 링버퍼 최저가 목표치 3072에 못 미치는 2560으로 고정된 건 피더가 목표에 닿으면 자고 한 블록(1024)씩 채우기 때문이다. 즉 여유는 한 블록이 아니라 53 ms 전부
- `repeated-seek`의 drift가 다른 시나리오보다 큰 건 seek 자체가 아니라 재충전 경계에서 남는 잔여분이다. 기준 50 ms 안이고 underrun은 0이다

짧은 타임라인으로 마지막 샘플 도달까지 확인한다. 10초 소재에 13초를 재생하면 한 번 wrap 하면서 `endedOnTheSample`이 검사된다.

```bash
DURATION_SECONDS=10 QUALITY_OUTPUT_DIR=/tmp/akbun-mv-short npm run quality:media
npm run quality:audio -- /tmp/akbun-mv-short/project.akbunvideo --seconds 13
```

## 재생 스케줄러 계측

화면에 나온 프레임이 나오는 소리와 맞는지 재는 헤드리스 하네스다. 창을 띄우지 않고 [viewport](../wiki/architecture/viewport.md)의 스케줄러를 실제 소재로 돌리며, 한 시나리오라도 기준을 넘기면 종료 코드가 0이 아니다.

```bash
cd product/akbun-makevideo/workspace
npm run quality:present -- /tmp/akbun-makevideo-quality/project.akbunvideo --seconds 30
```

주요 옵션은 `--depth`, `--lead`(영상), `--audio-depth`, `--audio-lead`(소리), `--resync`(클럭보다 몇 프레임 뒤처지면 건너뛰기 대신 점프하는지), `--preset`, `--backend`, `--seek-every`, `--report`다.

시나리오는 앞의 두 하네스와 이름을 맞춘다.

- `continuous-playback`: 연속 재생
- `repeated-seek`: 재생 중 반복 seek
- `increasing-track-count`: 보이는 영상 트랙을 1개에서 4개까지 증가

앞의 두 하네스가 볼 수 없는 실패를 재는 것이 이 하네스의 목적이다. 프레임 공급 하네스는 프레임이 제때 오는지를, 오디오 하네스는 소리가 끊기지 않고 클럭이 정직한지를 본다. 둘을 붙였을 때만 생기는 실패, 즉 **엉뚱한 순간에 그려진 프레임**은 어느 쪽에도 나타나지 않는다.

- `avDriftP50Ms`, `avDriftP99Ms`, `avDriftMaxMs`: 프레임이 화면에 닿은 순간 그 프레임과 들리는 소리의 거리. 이 단계가 존재하는 이유이자 기준이 가장 중요한 값이다. 기준은 페이지 하네스와 같은 50 ms
- `avLatenessP99Ms`: 같은 값을 부호 있게. 양수가 그림이 소리보다 늦은 쪽이고, 스케줄러가 만들 수 있는 방향은 이쪽뿐이다. 차례가 오기 전에 그리는 일은 없다
- `skippedFrames`: 클럭이 이미 지나가서 버린 프레임. 버려진 프레임은 드랍 프레임과 같은 것이므로 기준도 같은 0.1%다
- `skippedWhileRefilling`: 시작과 seek 직후 따라잡느라 버린 프레임. 보고만 하고 판정하지 않는다. 재충전은 시작 지연으로 이미 한 번 세고 있고, 같은 프레임을 드랍으로 다시 세면 모든 실행이 자기 시작을 벌점으로 받는다
- `presentIntervalP50Ms`, `presentIntervalP99Ms`: 실제로 화면이 바뀐 간격. 기준값은 프레임 공급 하네스와 같은 `ceil(1000/fps*1.25)`와 `ceil(1000/fps*2)`
- `resyncs`: 걸어서 따라잡는 것보다 점프가 싼 지점을 넘어 소스를 앞으로 건너뛴 횟수
- `underruns`: 소리가 끊긴 횟수. 클럭이 멈춰서 그림이 멈춘 것과 스케줄링 결함을 구분하려면 이 값이 있어야 한다
- `overran`: 시나리오가 자기 예산(재생할 타임라인 길이의 3배)을 넘겨 중단됨

따라가지 못하는 소스는 멈추지 않는다. 느리게, 건너뛰면서 진행하므로 "진척 없음" 규칙에 걸리지 않는다. 예산이 없으면 20초짜리 타임라인 측정이 4분 30초까지 늘어났고, 그 정도면 아무도 하네스를 돌리지 않는다.

### 측정값

기본값(depth 6, lead 15, resync 15)으로 1080p30 합성 소재를 시나리오당 30초씩, 같은 binary로 연속 3회 측정했다. **4코어 Linux 컨테이너에 lavapipe(소프트웨어 Vulkan)** 기준이며, 목표 머신인 macOS와 직접 비교하는 값이 아니다. 한 번이 아니라 범위를 남기는 이유는 회차 간 편차가 판정을 뒤집을 만큼 크기 때문이다.

| 시나리오 | 영상 트랙 | 표시 | 버림 | drift p50 | drift p99 | 간격 p50 | 간격 p99 | 시작 지연 p99 | underrun |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| continuous-playback | 1 | 900 | 1~3 | 16~17 ms | 20~48 ms | 32.4 ms | 46~62 ms | 162~221 ms | 0 / 2800+ |
| repeated-seek | 1 | 900 | 1~6 | 16 ms | 52~61 ms | 32.3 ms | 45~46 ms | 158~357 ms | 0 / 2900+ |
| increasing-track-count | 2 | 900 | 2~27 | 28~29 ms | 41~73 ms | 32.5 ms | 46~56 ms | 279~302 ms | 0 / 2800+ |

- 스케줄러가 클럭을 따라간다는 것 자체는 확인된다. 3회 중 2회에서 1~2 트랙 연속 재생의 drift p99가 기준 50 ms 안이고, 간격 p50은 세 시나리오 모두 프레임 주기 그대로인 32.4 ms다. underrun은 전 회차 0이고 멈춤과 예산 초과도 없다
- drift p50이 16 ms로 고정된 것은 소프트웨어 래스터라이저가 프레임 하나를 그리는 시간이다. 이 값은 프레임이 화면에 닿은 뒤에 재기 때문에 합성 비용이 그대로 들어간다. 실제 GPU에서는 1 ms 수준이고, 이 컨테이너의 수치를 목표 머신의 기준선으로 쓸 수 없는 가장 큰 이유다
- 남는 실패는 버린 프레임 비율이다. 900 프레임 중 1개가 0.11%로 기준 0.1%를 넘긴다. 기준선인 media element도 macOS에서 8,983 프레임 중 14개(0.156%)라, 이 기준은 기준 플랫폼도 통과한 적 없는 값이다. 낮추지 않고 그대로 둔다
- `repeated-seek`의 drift p99가 52~61 ms로 계속 기준을 넘는다. seek당 한 프레임씩 올라간 값이고, 재충전 직후 첫 프레임은 시작 지연으로 빼지만 그 다음 프레임은 아직 큐가 얕다. 30초에 seek 15회는 편집 중 실제 빈도보다 훨씬 높다
- 3회 중 1회(위 표의 상한)는 세 시나리오가 함께 나빠진다. 컨테이너가 다른 일을 하고 있었다는 뜻이고, 이 머신에서 단발 측정으로 판정하면 안 되는 이유다

3~4 트랙은 이 컨테이너에서 판정하지 않는다.

- 1080p 디코더 4개가 4코어를 채우는 지점이라 측정 대상이 스케줄러가 아니라 머신이 된다. 프레임 공급 하네스가 같은 이유로 같은 구간을 남기지 않은 것과 같다
- 출력 크기를 640x360으로 줄여도 결과가 거의 같았다. 병목이 합성이 아니라 디코딩이라는 뜻이고, 출력 해상도로는 완화되지 않는다

### 이 하네스가 찾은 것

세 가지 모두 눈으로 보고는 찾지 못했을 결함이고, 셋 다 고친 뒤 회귀 시험을 함께 넣었다.

1. 타임라인 끝에서 3초 멈춤. 클럭이 장치 지연만큼 뒤로 물러나 있어 마지막 프레임의 차례가 영원히 오지 않았다
2. 한 세션의 두 번째 seek부터 멈춤. seek 완료 카운터를 리셋해서, 두 번째 요청이 요청되는 순간 완료로 판정됐다
3. 하네스 자신이 대상보다 오래 도는 문제. 따라가지 못하는 소스는 멈추지 않고 느리게 진행하므로 "진척 없음" 규칙에 걸리지 않았다

## 기준선

- [media-element-macos.json](./media-element-macos.json)
- Apple M3 Pro의 macOS WebKit에서 2026-08-04 측정
- 5분 연속 재생: p50 33 ms, p99 69 ms, 8,983 표시 프레임 중 14 드랍
- 현재 경로의 상태를 고정한 비교 기준이며 합격 목표가 아님
- 이후 엔진은 동일 소재와 기본 설정으로 실행
- 절대 합격 기준과 media element 기준선 모두에 대해 회귀 여부 확인
