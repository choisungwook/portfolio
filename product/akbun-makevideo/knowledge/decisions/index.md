# Decisions

## 목록

* [Inspector는 타임라인에서 선택한 미디어 트랙을 따른다](2026-08-inspector-follows-timeline-media.md) - 연결된 clip의 속성을 Video와 Audio 탭으로 분리하고 선택한 트랙 탭을 먼저 보여 주는 결정.
* [native monitor는 window overlay에서 AppKit 좌표 변환을 사용한다](2026-08-native-monitor-is-a-window-overlay.md) - GPU surface를 WebKit hierarchy에서 분리하고 실제 view 사이 좌표 변환을 AppKit에 맡긴 결정.
* [첫 영상은 빈 기본 프로젝트의 canvas 비율을 정한다](2026-08-first-video-defines-default-canvas-shape.md) - 첫 영상 비율을 채택하되 기본 긴 변 해상도를 유지하는 결정.
* [native view 좌표는 superview에게 원점을 물어본다](2026-08-native-view-asks-its-superview-for-the-origin.md) - WKWebView가 flipped view라 bottom-left 가정이 monitor를 뒤집힌 위치에 놓은 뒤 정한 규칙.
* [filter graph 렌더는 rasterize한 still을 overlay로 굽는다](2026-08-graph-render-overlays-rasterized-stills.md) - CPU 렌더와 폴백에서 text/shape가 빠지던 것을 자체 raster + overlay로 해결한 결정.
* [그래픽 장치를 쓰는지 하나로 preview와 playback과 render를 함께 정한다](2026-08-one-axis-for-the-graphics-device.md) - compositor 설정을 GPU와 CPU 둘로 줄이고 playback 설정을 없앤 결정.
* [재생 끊김은 경로별 계측으로 원인을 분리](2026-08-playback-stutter-is-measured-by-stage.md) - 공급과 표시와 A/V 지연을 따로 보고 구조 교체를 미룬 결정.
* [경계 stub은 실제 API 이름만 가진다](2026-08-seam-stubs-carry-only-real-api-names.md) - 무엇에나 답하는 Proxy stub이 없는 메서드 호출을 숨긴 뒤 정한 규칙.
* [preview 배치는 한 곳에서 계산하고 point 단위로 넘긴다](2026-08-one-geometry-in-points-for-the-monitor.md) - devicePixelRatio 왕복과 크기만 보는 ResizeObserver를 없애고 배치 계산을 한 곳에 모은 결정.
* [CSS viewport 원점은 native bounds origin에서 시작한다](2026-08-css-viewport-starts-at-native-bounds-origin.md) - page 좌표를 native frame으로 옮길 때 NSView bounds origin을 반영하는 결정.
