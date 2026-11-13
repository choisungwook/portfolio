# Amazon Bedrock AgentCore Runtime V2

초기화에 20초를 쓰는 agent를 platform version V2 runtime에 올려, snapshot 기반 시작이 cold start를 어떻게 바꾸는지, snapshot이 어떤 상태를 모든 session에 복제하는지, runtime을 업데이트할 때 snapshot이 어떻게 교체되는지, 해제한 메모리가 과금에서 어떻게 빠지는지 측정하는 핸즈온입니다. V1 값은 2026-11-13에 따로 잰 참고 값입니다.

## 문서

| 순서 | 문서 | 내용 |
|---|---|---|
| 0 | [setup.md](./docs/setup.md) | ECR, IAM, V2 runtime, USAGE_LOGS 생성과 정리 |
| 1 | [1-feature-map.md](./docs/1-feature-map.md) | V2 기능 지도, 로드맵, 용어, 대안 비교. `platformVersion`을 생략하면 V1이 되므로 V2를 명시 |
| 2 | [2-snapshot-cold-start.md](./docs/2-snapshot-cold-start.md) | 초기화 20초 agent의 V2 cold start 2초 안팎, 동시 40개 p75 5.2초. 참고로 V1은 pool 소진 시 23.5초 |
| 3 | [3-snapshot-state.md](./docs/3-snapshot-state.md) | 초기화 때 만든 UUID와 handler 안의 `random.random()`까지 V2 session끼리 같아지는 것 |
| 4 | [4-update-snapshot.md](./docs/4-update-snapshot.md) | 업데이트 3분 36초 동안 새 session은 이전 snapshot, `READY` 뒤 새 snapshot. 기존 session은 이전 버전에 남음 |
| 5 | [5-memory-reclaim.md](./docs/5-memory-reclaim.md) | USAGE_LOGS로 본 과금 메모리. 해제 후 1분 안에 1.5GB로 회수. 참고로 V1은 3.66GB 유지, 합계는 V2가 33% 적음 |
| 6 | [6-more-v2-options.md](./docs/6-more-v2-options.md) | 실측하지 않은 committed baseline, lifecycle hook, 이미지 크기와 cold start |
| - | [troubleshooting.md](./docs/troubleshooting.md) | 실습 중 겪은 문제 |

## 디렉터리

| 경로 | 내용 |
|---|---|
| `agent/` | stdlib HTTP 서버 agent. `INIT_SECONDS`, `INIT_MEMORY_MB`로 무거운 초기화를 흉내 냄 |
| `terraform/` | ECR, 실행 IAM role, V2 runtime(`rtv2_v2`), USAGE_LOGS delivery |
| `scripts/push-image.sh` | arm64 이미지 빌드와 ECR push |
| `scripts/runtime.py` | `GetAgentRuntime`, `InvokeAgentRuntime`, `StopRuntimeSession` 호출과 측정, USAGE_LOGS 집계 |
| `knowledge/` | 결정 이유 |
