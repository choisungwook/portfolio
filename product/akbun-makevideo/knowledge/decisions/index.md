# Decisions

## 목록

* [그래픽 장치를 쓰는지 하나로 preview와 playback과 render를 함께 정한다](2026-08-one-axis-for-the-graphics-device.md) - compositor 설정을 GPU와 CPU 둘로 줄이고 playback 설정을 없앤 결정.
* [재생 끊김은 경로별 계측으로 원인을 분리](2026-08-playback-stutter-is-measured-by-stage.md) - 공급과 표시와 A/V 지연을 따로 보고 구조 교체를 미룬 결정.
* [경계 stub은 실제 API 이름만 가진다](2026-08-seam-stubs-carry-only-real-api-names.md) - 무엇에나 답하는 Proxy stub이 없는 메서드 호출을 숨긴 뒤 정한 규칙.
