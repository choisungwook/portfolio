# 부록. 실측하지 않은 V2 기능: committed baseline, lifecycle hook, 이미지 크기

## 이 문서의 범위

| 항목 | 내용 |
|---|---|
| 기능 | committed baseline(`resourceConfigurations`), build warmup lifecycle hook(`hooksConfiguration`), 이미지 크기와 cold start |
| 근거 | AgentCore 개발자 가이드(2026-11-13 기준). AWS에서 실측하지 않음 |
| 이 핸즈온과의 관계 | 시나리오 2, 3, 5에서 다루지 않은 V2 기능. Terraform provider 6.73에는 `resourceConfigurations`와 `hooksConfiguration` 인자가 없어 실습 코드에 넣지 않음 |

## committed baseline

[시나리오 5](./5-memory-reclaim.md)에서 잰 것은 V2 기본값인 사용량 기반 과금입니다. session마다 2 vCPU, 8GB가 할당되고, agent가 실제로 쓴 vCPU와 메모리만 초 단위로 과금됩니다. 할당 이상으로 burst할 수는 없습니다.

committed baseline은 runtime에 `resourceConfigurations`를 하나 넣어 session마다 늘 확보할 크기를 정하는 방식입니다. baseline까지는 session이 끝날 때까지 늘 과금되고, 그 위로는 baseline의 4배까지 burst하며 넘은 만큼만 초 단위로 과금됩니다. 두 부분 모두 사용량 기반보다 낮은 단가를 씁니다. 크기는 메모리(`minimumMemoryInMiB`)로만 정하고 vCPU는 4GB당 1 vCPU로 함께 정해집니다.

| `minimumMemoryInMiB` | baseline | 최대 | 디스크 |
|---|---|---|---|
| `1024` | 1GB, 0.25 vCPU | 4GB, 1 vCPU | 10GB |
| `2048` | 2GB, 0.5 vCPU | 8GB, 2 vCPU | 10GB |
| `4096` | 4GB, 1 vCPU | 16GB, 4 vCPU | 16GB |
| `8192` | 8GB, 2 vCPU | 32GB, 8 vCPU | 32GB |

발표문의 "session당 최대 8 vCPU, 32GB"는 이 표의 마지막 줄입니다. 사용량 기반 과금으로는 2 vCPU, 8GB를 넘을 수 없으므로, 큰 session이 필요하면 committed baseline을 써야 합니다.

AWS CLI로 baseline 4GB인 V2 runtime을 만드는 요청입니다.

```bash
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name my_agent \
  --role-arn <실행 role ARN> \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"<이미지 URI>"}}' \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --platform-version V2 \
  --resource-configurations '[{"minimumMemoryInMiB": 4096}]'
```

운영할 때 알아 둘 점입니다.

- `UpdateAgentRuntime`은 resource configuration을 요청 값으로 바꿉니다. 이미지만 바꾸는 업데이트에도 같은 `resourceConfigurations`를 넣어야 크기가 유지되고, 빼면 사용량 기반 과금으로 돌아갑니다.
- 바뀐 크기는 새 session부터 적용됩니다. 이미 돌고 있는 session은 끝날 때까지 이전 크기를 씁니다.
- 고르는 기준은 사용량입니다. 사용량 기반으로 먼저 운영하면서 `CPUUsed-vCPUHours`, `MemoryUsed-GBHours` 지표나 USAGE_LOGS를 보고, 대부분의 시간에 쓰는 크기를 baseline으로 잡습니다.
- [시나리오 5](./5-memory-reclaim.md)처럼 idle 시간이 길고 최대 메모리 구간이 짧은 agent는 사용량 기반이 유리합니다. 메모리 index나 캐시를 session 내내 쥐는 agent는 어차피 내내 과금되므로 단가가 낮은 baseline이 유리합니다.

## lifecycle hook

V2 lifecycle hook은 AgentCore Runtime이 정해진 시점에 컨테이너의 endpoint를 호출하는 기능입니다. 지금 제공되는 hook은 `build` 단계의 `warmup` 하나입니다. `CreateAgentRuntime`, `UpdateAgentRuntime`이 agent를 준비하는 동안, 즉 snapshot을 찍기 전에 호출됩니다. snapshot을 복원한 뒤 session마다 호출되는 hook은 없으므로 [시나리오 3](./3-snapshot-state.md)의 복제 문제를 hook으로 풀 수는 없습니다.

warmup hook은 같은 endpoint를 2번 호출하고, `X-Amzn-Bedrock-AgentCore-Runtime-Warmup-Type` header로 어느 호출인지 알려 줍니다.

| 순서 | header 값 | 할 일 |
|---|---|---|
| 1 | `memory` | `/ping`이 성공한 뒤 호출됨. 모든 session이 쓸 import, 모델, 캐시를 메모리에 올림. snapshot은 이 호출 뒤에 찍힘 |
| 2 | `disk` | session이 시작할 때 읽는 파일을 미리 읽음. 새 session이 그 파일을 더 빨리 쓰게 함 |

warmup hook을 `POST /warmup`(포트 8080)으로 설정하는 요청입니다.

```bash
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name my_agent \
  --role-arn <실행 role ARN> \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"<이미지 URI>"}}' \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --platform-version V2 \
  --hooks-configuration '{"build":{"warmup":{"action":{"httpPost":{"path":"/warmup","port":8080}}}}}'
```

운영할 때 알아 둘 점입니다.

- 두 호출이 합쳐서 120초 안에 끝나야 합니다. `memory`가 50초를 쓰면 `disk`에는 70초가 남습니다. 이 한도는 바꿀 수 없습니다.
- hook은 2xx를 돌려줘야 성공입니다. 실패하거나 시간을 넘기면 재시도 없이 create, update가 `CREATE_FAILED`, `UPDATE_FAILED`가 됩니다.
- hook이 도는 동안에도 `/ping`에 응답해야 합니다. 이 핸즈온의 agent처럼 stdlib 서버를 쓰면 `ThreadingHTTPServer`처럼 요청을 동시에 처리하는 서버여야 합니다.
- `UpdateAgentRuntime`은 hook 설정을 통째로 바꿉니다. 업데이트마다 `hooksConfiguration`을 넣어야 hook이 유지됩니다.
- V1 runtime에 넣으면 `ValidationException`이 발생합니다.
- hook 로그는 `/aws/bedrock-agentcore/runtimes/<runtime ID>-DEFAULT` log group의 `build-logs-`로 시작하는 stream에 남습니다.

hook이 필요한 경우는 2가지입니다. 하나는 `/ping`이 초기화와 무관하게 바로 성공하는 프레임워크를 쓸 때입니다. snapshot은 첫 `/ping` 성공 시점에 찍히므로, 초기화를 `memory` 호출로 옮겨야 초기화된 상태가 snapshot에 담깁니다. 다른 하나는 session이 시작하자마자 큰 파일(바이너리, 큰 파이썬 패키지, headless browser)을 읽는 agent입니다. `disk` 호출로 그 파일을 미리 읽어 둡니다. 이 핸즈온의 agent는 초기화가 끝난 뒤 포트를 열므로 hook 없이도 초기화된 상태가 snapshot에 담깁니다.

## 이미지 크기와 cold start

V1은 새 session마다 이미지를 불러오므로 이미지가 클수록 cold start가 길어집니다. 발표문의 "2GB 이미지에서 V1 P75 29.7초"가 이 비용입니다. V2는 snapshot을 복원하므로 개발자 가이드는 cold start가 동시성뿐 아니라 이미지 크기와도 무관하게 일정하다고 씁니다. 이미지 크기는 snapshot을 준비하는 create, update 시간에만 반영됩니다.

| 항목 | V1 | V2 |
|---|---|---|
| 이미지 크기 상한(압축) | 2GB | 10GB |
| 이미지 크기가 cold start에 주는 영향 | session마다 이미지 로딩 | snapshot 복원이라 영향이 거의 없음(가이드 설명) |
| 2GB가 넘는 이미지 | 쓸 수 없음 | 더 큰 `minimumMemoryInMiB`가 필요. build 디스크가 모자라면 생성이 실패함 |

이 핸즈온의 이미지는 python slim 기반이라 작고, 초기화 20초로 무거운 agent를 흉내 냈습니다. 큰 이미지에서 V2 cold start가 정말 일정한지 재려면 큰 패키지나 모델 파일을 넣은 이미지를 만들어 [시나리오 2](./2-snapshot-cold-start.md)의 `cold`, `burst`를 다시 실행합니다. 2GB를 넘는 이미지는 위 표처럼 committed baseline과 함께 써야 하므로 Terraform이 `resourceConfigurations`를 지원한 뒤에 다룹니다.

## 참고 문서

1. [AgentCore 개발자 가이드: Resource configurations](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html#runtime-v2-resource-configurations)
2. [AgentCore 개발자 가이드: Configure lifecycle hooks](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-lifecycle-hooks.html)
3. [AgentCore 개발자 가이드: Optimize your agent for AgentCore Runtime V2](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-v2-optimize.html)
