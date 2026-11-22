# EXAONE 4.5 MTP와 reasoning 모드 이론 핸즈온

EXAONE 4.5 33B의 공식 체크포인트는 reasoning 모드를 끄면 MTP(Multi-Token Prediction) 수용률이 1% 아래로 떨어져, MTP를 켜는 쪽이 오히려 느려집니다. 이 핸즈온은 MTP speculative decoding이 빨라지는 조건을 계산으로 정리하고, 공개 실험 수치를 읽은 뒤, 내 트래픽에서 확인하는 비교 테스트를 설계합니다.

GPU 없이 작성한 이론 핸즈온입니다. vLLM과 EXAONE 4.5로 실행하지 않았고, GuideLLM 명령은 mock 서버로 문법과 요청 body만 확인했습니다.

## 문서 순서

| 단계 | 문서 | 다루는 내용 |
| --- | --- | --- |
| 1 | [MTP는 추측이 맞을 때만 빨라진다](docs/1-mtp-theory.md) | 기능 지도, step 동작, `1 + k × 수용률` 속도 공식, 손익분기 수용률 |
| 2 | [EXAONE 4.5는 reasoning을 끄면 MTP가 손해다](docs/2-reasoning-mtp-acceptance.md) | 공개 실험 수치(1.51× 대 0.85×), 은닉 상태 원인 분석, 운영 판단 |
| 준비 | [환경 준비](docs/setup.md) | vLLM, GuideLLM 0.8.1 설치, Mooncake trace 다운로드, mock 서버 |
| 3 | [MTP on/off 비교는 수용률과 부하를 따로 잰다](docs/3-benchmark-design.md) | vLLM 서버 구성, 자연 프롬프트 수용률, 합성 sweep, Mooncake replay |

## 디렉터리

| 경로 | 내용 |
| --- | --- |
| `docs/` | 시나리오 문서 |
| `data/natural-prompts.jsonl` | 수용률 측정용 자연 프롬프트 5개 |
| `knowledge/` | 이 workspace의 결정 기록 |
