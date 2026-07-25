# 아키텍처

Electron 표준 3분할(main, preload, renderer) 구조다. 메인 프로세스는 창 생성·파일 대화상자·파일 읽기·목록 영속만 하고, 오디오 디코딩·파형 계산·재생은 전부 렌더러가 한다.

## 프로세스와 데이터 흐름

파일을 불러와 재생 화면이 뜨기까지의 흐름이다.

```text
[main]     library:add → dialog.showOpenDialog → library.json 갱신 → 목록 반환
[renderer] 목록 클릭 → audio:read(path) 요청
[main]     fs.readFile → Uint8Array 반환
[renderer] ① Blob URL → HTMLAudioElement.src   (재생 담당)
           ② decodeAudioData → peak 계산 → Waveform 캔버스 (표시 담당)
```

같은 파일 바이트를 한 번 읽어 재생과 파형 양쪽에 쓴다. 재생을 HTMLAudioElement로 하는 이유는 [ADR](../knowledge/decisions/2026-07-html-audio-plus-webaudio-split.md) 참조.

## IPC 채널

| 채널 | 방향 | 역할 |
|---|---|---|
| library:list | renderer → main | 저장된 파일 목록 조회 |
| library:add | renderer → main | 파일 선택 대화상자를 열고 목록에 추가 |
| library:remove | renderer → main | 목록에서 제거 |
| library:set-duration | renderer → main | 첫 디코딩 후 길이를 목록에 저장 |
| audio:read | renderer → main | 파일 바이트 읽기 |

채널을 추가하면 main.ts(핸들러), preload.ts(브리지), api.d.ts(타입)를 함께 고친다.

## 화면 구조

index.html에 두 section이 있고 hidden 속성으로 전환한다.

- home-screen: 파일 불러오기 버튼 + 파일 목록. 항목 클릭 → 재생 화면
- player-screen: 상단(홈 버튼, 파일명, 파형 확대/축소), 중앙(파형 캔버스), 하단(재생/일시정지, 배속, ±5초, 구간 반복)

## 파일 목록 영속

`app.getPath("userData")/library.json`에 경로·이름·길이·추가시각을 저장한다. 파일 자체는 복사하지 않고 원본 경로를 참조한다.
