# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-25

* **Update**: 번들의 OKF 0.2 스펙 사본을 지우고 저장소 루트의 `templates/okf-spec-0.3.md`를 참조하도록 바꾸고, 번들 index의 okf_version을 0.3으로 변경. 0.1 형식 concept 2개의 `timestamp`와 `## Citations`를 `generated`와 `sources`로 변환. 작성자를 알 수 없어 `generated.by`는 `claude-code/unknown`으로 둠.

## 2026-11-08

* **Update**: OKF v0.2 스펙 사본(삭제됨) 0.1 사본을 0.2 원문으로 교체. 0.2부터 timestamp와 Citations 대신 generated와 sources를 씀.

## 2026-08-30

* **Creation**: [모델 로드와 워크로드 실행 분리](decisions/2026-08-separate-load-and-workload.md) 결정 기록. 가중치 적재 실패와 워크로드 OOM을 두 계산으로 구분했다.
* **Creation**: [config.json 기반 단일 GPU VRAM 예측](decisions/2026-08-config-driven-vram.md) 결정 기록. 모델이 GPU에 적재되는지를 먼저 설명하는 계산 경계를 남겼다.
