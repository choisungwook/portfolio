# Asset waveform cache

## Decision

- 오디오가 있는 asset마다 초당 100개의 최소·최대 진폭 쌍 생성
- 프로젝트의 `waveforms/` 폴더에 원본 경로·수정 시각과 함께 JSON 저장
- ffmpeg 디코딩과 축약은 백그라운드 worker에서 실행
- audio clip 내부 canvas에서 trim 구간만 다시 표본화

## Reason

- 같은 asset을 자르거나 옮겨도 오디오 재계산 불필요
- 원본 경로 또는 수정 시각 변경 시 기존 파형 무효화
- 확대 배율과 무관하게 clip source 구간과 파형 구간 일치

## Tradeoffs

- 계산 완료 전 이름만 표시해 편집 흐름 유지
- 긴 오디오일수록 프로젝트 파생 파일과 IPC payload 증가
- canvas 내부 폭을 4096px로 제한해 극단적 확대에서 세부 정보 축약
