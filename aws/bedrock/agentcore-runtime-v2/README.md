# Amazon Bedrock AgentCore Runtime V2

같은 agent 이미지를 platform version V1과 V2 runtime에 올려, V2의 snapshot 기반 시작이 cold start를 어떻게 바꾸는지, snapshot이 어떤 상태를 모든 session에 복제하는지, 기존 runtime을 V2로 무중단 전환하는 과정과 session별 메모리 사용량을 측정하는 핸즈온입니다.

## 문서

| 순서 | 문서 | 내용 |
|---|---|---|
| 0 | [setup.md](./docs/setup.md) | ECR, IAM, runtime 3개, USAGE_LOGS 생성과 정리 |
| 1 | [1-feature-map.md](./docs/1-feature-map.md) | V2 기능 지도, 용어, 대안 비교. `platformVersion`을 생략하면 V1이 되는 것 확인 |
| 2 | [2-snapshot-cold-start.md](./docs/2-snapshot-cold-start.md) | V1 warm pool 0.4초와 소진 후 23.5초, V2 1.7초. 동시 40개 burst에서 V1 p75 27초, V2 5초 |
| 3 | [3-snapshot-state.md](./docs/3-snapshot-state.md) | 초기화 때 만든 UUID와 handler 안의 `random.random()`까지 V2 session끼리 같아지는 것 |
| 4 | [4-upgrade-v1-to-v2.md](./docs/4-upgrade-v1-to-v2.md) | `platform_version` 변경 3분 35초, 전환 중 무중단, 기존 session은 V1에 남음 |
| 5 | [5-memory-reclaim.md](./docs/5-memory-reclaim.md) | USAGE_LOGS로 본 과금 메모리. V1은 해제 후에도 최대치 3.66GB 유지, V2는 1분 안에 1.5GB로 회수, 합계 33% 감소 |
| - | [troubleshooting.md](./docs/troubleshooting.md) | 실습 중 겪은 문제 |

## 디렉터리

| 경로 | 내용 |
|---|---|
| `agent/` | stdlib HTTP 서버 agent. `INIT_SECONDS`, `INIT_MEMORY_MB`로 무거운 초기화를 흉내 냄 |
| `terraform/` | ECR, 실행 IAM role, runtime 3개(`legacy`, `v2`, `default`), USAGE_LOGS delivery |
| `scripts/push-image.sh` | arm64 이미지 빌드와 ECR push |
| `scripts/runtime.py` | `GetAgentRuntime`, `InvokeAgentRuntime`, `StopRuntimeSession` 호출과 측정, USAGE_LOGS 집계 |
| `knowledge/` | 결정 이유 |
