# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [config.json 기반 단일 GPU VRAM 예측](2026-08-config-driven-vram.md) - 모델 가중치, KV 캐시, 추가 메모리의 합을 한 GPU 용량과 비교한다.
* [모델 로드와 워크로드 실행 분리](2026-08-separate-load-and-workload.md) - 모델 가중치 적재와 요청 처리에 필요한 메모리를 두 단계로 구분한다.
