# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-08-30

* **Creation**: [모델 로드와 워크로드 실행 분리](decisions/2026-08-separate-load-and-workload.md) 결정 기록. 가중치 적재 실패와 워크로드 OOM을 두 계산으로 구분했다.
* **Creation**: [config.json 기반 단일 GPU VRAM 예측](decisions/2026-08-config-driven-vram.md) 결정 기록. 모델이 GPU에 적재되는지를 먼저 설명하는 계산 경계를 남겼다.
