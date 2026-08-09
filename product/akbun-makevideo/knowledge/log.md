# Knowledge Update Log

## 2026-08-09

* [그래픽 장치를 쓰는지 하나로 preview와 playback과 render를 함께 정한다](decisions/2026-08-one-axis-for-the-graphics-device.md) 결정 기록. 불가능한 설정 조합을 없애고 판정을 한 쌍의 함수로 모음.
* [재생 끊김은 경로별 계측으로 원인을 분리](decisions/2026-08-playback-stutter-is-measured-by-stage.md)에 결과 절 추가. 계측이 가리킨 원인과 그 해결을 남김.
* [경계 stub은 실제 API 이름만 가진다](decisions/2026-08-seam-stubs-carry-only-real-api-names.md) 결정 기록. preview와 라우터가 이름을 공유하는 자리에서 stub이 없는 메서드를 통과시킨 사례를 남김.
* [재생 끊김은 경로별 계측으로 원인을 분리](decisions/2026-08-playback-stutter-is-measured-by-stage.md) 결정 기록. native surface 전환 뒤에는 원인 수치를 먼저 확인하고 구조 변경 여부를 판단함.
