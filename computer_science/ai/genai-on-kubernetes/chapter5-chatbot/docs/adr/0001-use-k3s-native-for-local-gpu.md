# Use K3s native for local GPU practice

## Status

Accepted

## Context

Chapter 5 실습은 JupyterHub, fine-tuning Job, inference API, chatbot UI를 모두 Kubernetes 위에서 실행해야 한다. 사용 환경은 Ubuntu 24.04 LTS 서버 1대와 NVIDIA RTX 5060 16GB GPU다.

초기에는 kind/nvkind를 고려했다. 하지만 kind는 Docker container가 Kubernetes node가 되므로 host GPU를 kind node container에 넘긴 뒤 다시 Pod에 할당해야 한다. GPU를 처음 다루는 실습자에게는 실패 지점이 늘어난다.

K3s native에서는 Ubuntu host가 Kubernetes node다. K3s containerd가 host NVIDIA runtime을 직접 사용하고, NVIDIA device plugin이 `nvidia.com/gpu` 리소스를 노출한다.

## Decision

로컬 GPU 실습은 kind/nvkind 대신 single-node K3s native로 진행한다.

`k3s/` 디렉터리는 K3s 전용 문서, manifests, notebook, fine-tuning 코드, inference 코드를 가진다. EKS 실습은 `eks/` 디렉터리에 유지한다.

## Consequences

장점:

- GPU runtime 계층이 단순해진다.
- JupyterHub, fine-tuning Job, inference API를 오래 띄워두는 서버 실습에 맞다.
- K3s와 EKS의 Kubernetes 흐름은 유지하면서 인프라 차이를 명확히 분리할 수 있다.

단점:

- K3s 설치와 삭제가 host systemd service를 변경한다.
- clean-room cluster를 자주 만들고 지우는 테스트는 kind보다 덜 가볍다.
- GPU가 1개이면 GPU Pod를 동시에 여러 개 실행하기 어렵다.

## Verification

- K3s node taint가 `Taints: <none>`인지 확인한다.
- `kubectl get runtimeclass nvidia`로 NVIDIA RuntimeClass를 확인한다.
- `kubectl get nodes -o jsonpath='{.items[*].status.allocatable.nvidia\.com/gpu}'`가 `1` 이상인지 확인한다.
- GPU smoke test Pod에서 `nvidia-smi`가 실행되는지 확인한다.
