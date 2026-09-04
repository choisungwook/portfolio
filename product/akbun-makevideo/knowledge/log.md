# Knowledge Update Log

## 2026-09-04

* [Program Monitor 전체 화면은 편집 레이아웃을 숨겨 보존한다](decisions/2026-09-program-monitor-fullscreen-preserves-layout.md) 결정 기록. 전체 화면 진입 전 panel과 timeline 상태를 CSS 전환으로 유지함.
* [page controller는 의존성과 공개 경계를 선언한다](decisions/2026-09-page-controllers-declare-boundaries.md) 결정 기록. classic script 전역을 factory 하나로 제한하고 의존성을 생성 시점에 전달함.
* [Source monitor의 in-out은 재생 경계다](decisions/2026-09-source-monitor-range-is-playback-boundary.md) 결정 갱신. 선택 범위를 preview 재생 경계와 timeline drag 삽입 범위로 사용함.
* [타임라인 드래그 중 compositor 상태 전환을 미룬다](decisions/2026-09-timeline-drag-defers-compositor.md) 결정 기록. pointer-down에서 exact frame 재합성과 반복 배치 읽기를 제외하고 지연 수치를 노출함.

## 2026-09-02

* [filter graph 렌더는 정적 visual만 rasterize한 still로 굽는다](decisions/2026-08-graph-render-overlays-rasterized-stills.md) 결정 갱신. video paint가 정적 overlay로 굳지 않도록 CPU 설정에서도 프레임 합성 경로를 사용하고 장기 decoder를 재사용함.

## 2026-09-01

* [프록시는 해상도뿐 아니라 decode와 seek 비용을 줄인다](decisions/2026-09-proxy-targets-decode-and-seek-cost.md) 결정 기록. 1080p 비직접 재생 코덱과 긴 GOP 원본을 판정 대상에 넣고 프록시에 0.5초 키프레임을 강제함.

## 2026-08-23

* [계측 하네스는 자기 지연과 재시작 지연을 대상의 실패로 세지 않는다](decisions/2026-08-harness-does-not-count-its-own-delay.md) 결정을 루트 knowledge에서 옮겨 옴. akbun-makevideo의 프레임 공급 계측에서 나온 판단이라 여기에 둠.

## 2026-08-22

* [monitor는 패널을 채우고 source monitor는 에셋 비율로 맞춘다](decisions/2026-08-monitor-fills-the-panel.md) 결정 기록. 그림이 패널에 못 미치던 원인을 여백과 이중 레터박스로 좁히고, 두 monitor의 행이 어긋나던 것을 subgrid 공유로 바꿈.

## 2026-08-19

* [Inspector는 타임라인에서 선택한 미디어 트랙을 따른다](decisions/2026-08-inspector-follows-timeline-media.md) 결정 기록. 연결된 영상과 오디오의 속성 대상과 기본 탭을 타임라인 선택에 맞춤.

## 2026-08-12

* [native monitor는 window overlay에서 AppKit 좌표 변환을 사용한다](decisions/2026-08-native-monitor-is-a-window-overlay.md) 결정 기록. GPU preview 오프셋을 WebKit 내부 layer 문제가 아닌 window overlay 좌표 변환 문제로 분리함.
* [CSS viewport 원점은 native bounds origin에서 시작한다](decisions/2026-08-css-viewport-starts-at-native-bounds-origin.md) 결정 기록. 같은 크기의 media element와 native surface가 세로로 어긋난 원인을 WKWebView bounds origin 누락으로 좁힘.

## 2026-08-11

* [preview 배치는 한 곳에서 계산하고 point 단위로 넘긴다](decisions/2026-08-one-geometry-in-points-for-the-monitor.md) 결정 기록. native monitor가 preview 밖에 그려지고 비율이 어긋나던 원인을 좌표 왕복과 크기만 보는 관찰자로 좁히고 geometry.js로 계산을 모음.

## 2026-08-10

* [첫 영상은 빈 기본 프로젝트의 canvas 비율을 정한다](decisions/2026-08-first-video-defines-default-canvas-shape.md) 결정 기록. 9:16 영상이 기본 16:9 preview에서 과도하게 축소된 사례를 바탕으로 비율 자동 채택 범위를 정함.
* [native view 좌표는 superview에게 원점을 물어본다](decisions/2026-08-native-view-asks-its-superview-for-the-origin.md) 결정 기록. WKWebView의 isFlipped가 YES인 것을 실측으로 확인하고 viewport 변환을 superview 질의로 바꿈.
* [filter graph 렌더는 rasterize한 still을 overlay로 굽는다](decisions/2026-08-graph-render-overlays-rasterized-stills.md) 결정 기록. CPU 렌더와 폴백이 text/shape를 조용히 떨어뜨리던 문제의 해법 선택을 남김.

## 2026-08-09

* [그래픽 장치를 쓰는지 하나로 preview와 playback과 render를 함께 정한다](decisions/2026-08-one-axis-for-the-graphics-device.md) 결정 기록. 불가능한 설정 조합을 없애고 판정을 한 쌍의 함수로 모음.
* [재생 끊김은 경로별 계측으로 원인을 분리](decisions/2026-08-playback-stutter-is-measured-by-stage.md)에 결과 절 추가. 계측이 가리킨 원인과 그 해결을 남김.
* [경계 stub은 실제 API 이름만 가진다](decisions/2026-08-seam-stubs-carry-only-real-api-names.md) 결정 기록. preview와 라우터가 이름을 공유하는 자리에서 stub이 없는 메서드를 통과시킨 사례를 남김.
* [재생 끊김은 경로별 계측으로 원인을 분리](decisions/2026-08-playback-stutter-is-measured-by-stage.md) 결정 기록. native surface 전환 뒤에는 원인 수치를 먼저 확인하고 구조 변경 여부를 판단함.
