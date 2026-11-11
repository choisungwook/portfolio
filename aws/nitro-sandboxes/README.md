# AWS Nitro Sandboxes 핸즈온: EC2 Firecracker와 EKS isolated pod

2026년 11월에 나온 AWS Nitro Sandboxes를 EC2와 EKS로 나눠 실습합니다. EC2에서는 Firecracker로 Sandbox를 직접 띄워 confidential 모드에서 부모 인스턴스가 guest 메모리를 읽지 못하는 것을 확인하고, EKS에서는 `runtimeClassName: isolated-sandbox` pod이 노드와 다른 커널에서 도는 것을 일반 pod과 비교하고, Gemma 2B가 만든 코드를 sandbox에 가둬 무엇이 막히고 무엇이 안 막히는지 CloudWatch 로그로 확인합니다.

## 문서

| 문서 | 환경 | 내용 |
|---|---|---|
| [1-feature-map.md](docs/1-feature-map.md) | 없음 | 기능 지도, 용어, 대안 비교, 시나리오 순서 |
| [2-setup-ec2.md](docs/2-setup-ec2.md) | EC2 | 부모 인스턴스 환경 up, down |
| [3-ec2-firecracker-sandbox.md](docs/3-ec2-firecracker-sandbox.md) | EC2 | memory pool, confidential과 direct 모드 메모리 검사, IMDS 차단, CPU overcommit |
| [4-setup-eks.md](docs/4-setup-eks.md) | EKS | EKS 1.37 Auto Mode 환경 up, down |
| [5-eks-isolated-pod.md](docs/5-eks-isolated-pod.md) | EKS | runc pod과 isolated pod 비교, hostPID 범위, 네트워크 제거 |
| [6-ai-agent-code-sandbox.md](docs/6-ai-agent-code-sandbox.md) | EKS | Gemma 2B가 만든 코드를 runc와 sandbox에서 실행. 막히는 것, 안 막히는 것, CloudWatch 로그와 메트릭 |
| [7-next-steps.md](docs/7-next-steps.md) | 없음 | 이번에 하지 않은 것: attestation, confidential pod, ECS |
| [troubleshooting.md](docs/troubleshooting.md) | 없음 | 실습 중 겪은 문제와 해결 |

## 실습 코드

| 디렉터리 | 내용 |
|---|---|
| [terraform/ec2/](terraform/ec2/) | ap-northeast-2, VPC 모듈, `m7g.large` 부모 인스턴스. SSH는 내 공인 IP만 허용 |
| [terraform/eks/](terraform/eks/) | us-west-2, VPC 모듈, EKS 1.37 Auto Mode. API endpoint는 내 공인 IP만 허용 |
| [guest/](guest/) | Sandbox init script, Firecracker 설정, 부모에서 guest 메모리를 검사하는 스크립트 |
| [manifests/](manifests/) | 시나리오 5의 pod manifest, 시나리오 6의 [ai-agent/](manifests/ai-agent/) |
| [agent/](agent/) | 시나리오 6의 agent. Gemma에게 코드를 받아 executor 3개에서 실행하고 JSON 로그를 남김 |
| [for-writing-ai.md](for-writing-ai.md) | 문서만 고치는 글쓰기 교정 AI용 context |
