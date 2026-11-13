# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-14

* **Creation**: [판정 모델은 로컬 Ollama gemma2:2b를 CPU 전용으로](decisions/2026-11-local-judge-model.md) 결정 기록. JEV를 쓰지 않은 이유와 CPU 판정 시간 실측을 남긴다.
* **Creation**: [시나리오는 공식 기능이거나 공개 사례가 있는 것만](decisions/2026-11-scenario-scope.md) 결정 기록. 지운 6개 단계와 그 이유를 남긴다.
* **Deletion**: 판단 기록과 원문 비노출 결정. 해당 관측 단계를 지워 더 이상 맞지 않는다.

## 2026-11-13

* **Creation**: [훅 코드를 gateway 패키지로 설치](decisions/2026-11-gateway-package.md) 결정 기록. callbacks 문자열이 import되는 경로를 남긴다.
* **Creation**: 판단 기록과 원문 비노출(2026-11-14 삭제) 결정 기록. 실측으로 확인한 spend log 동작을 남긴다.
* **Update**: [LiteLLM 1.109.1로 고정](decisions/2026-11-litellm-version.md) 2026-11-13 기준 PyPI·OSV·GitHub Advisory에 알려진 취약점이 없음을 추가.
* **Creation**: [LiteLLM 1.109.1로 고정](decisions/2026-11-litellm-version.md) 결정 기록. 소스 경로를 적을 기준 버전과 고른 이유를 남긴다.
