# Knowledge Update Log

## 2026-08-12

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
