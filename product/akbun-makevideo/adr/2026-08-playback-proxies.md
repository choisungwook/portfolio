# Playback proxies

## Decision

- 1920px보다 큰 동영상만 1280px 장변 H.264 프록시 생성
- 프로젝트의 `proxies/` 폴더에 미디어와 원본 경로·수정 시각 manifest 저장
- 재생 프로젝트 복사본에서만 프록시 경로 사용
- `Playback → Proxy Media…`에서 프록시 재생 전환과 생성 상태 제공

## Context

- preview quality는 합성 크기만 줄이고 원본 디코드 비용은 줄이지 못함
- 프록시 준비 전에는 원본 재생 유지
- 프록시 생성은 항상 백그라운드에서 유지하고 사용 여부만 설정으로 전환
- 원본 경로 또는 수정 시각 변경 시 기존 프록시 무효화
- export는 문서의 원본 경로를 계속 사용

## Consequences

- 4K 다중 트랙의 재생 디코드 비용 감소
- 첫 재생 전 백그라운드 변환 비용과 프로젝트 폴더 용량 증가
- 프록시 완료 시 native monitor 재시작 필요
