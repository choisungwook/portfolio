# vLLM 로컬 GPU 서버와 Kubernetes 핸즈온

로컬 Linux GPU 서버에서 vLLM을 먼저 단일 컨테이너로 실행하고, 같은 구성을 Kubernetes Pod로 옮길 때 GPU 런타임과 device plugin이 어떤 역할을 하는지 확인한다.

## TL;DR

- Docker에서는 NVIDIA Container Toolkit과 `--gpus all` 조건을 먼저 확인한다.
- Kubernetes는 kind를 먼저 검토하되, 실제 GPU 노드 실습은 k3s를 기본 경로로 둔다.
- 민감한 토큰은 문서와 manifest에 넣지 않고 실행 시 환경변수나 Secret으로만 주입한다.

## 학습 순서

1. [로컬 GPU 서버에서 vLLM을 먼저 띄우는 이유](docs/1-local-gpu-server.md)
2. [Kubernetes 환경은 왜 kind보다 k3s로 가는가](docs/2-kubernetes-runtime-choice.md)
3. [k3s에서 vLLM Pod를 실행하고 API를 검증하는 방법](docs/3-kubernetes-vllm-serving.md)

## 파일 구조

```text
.
├── README.md
├── Makefile
├── docker-compose.yml
├── docs/
│   ├── 1-local-gpu-server.md
│   ├── 2-kubernetes-runtime-choice.md
│   └── 3-kubernetes-vllm-serving.md
└── manifests/
    └── k3s/
        ├── deployment.yaml
        ├── kustomization.yaml
        ├── namespace.yaml
        ├── pvc.yaml
        └── service.yaml
```

## 빠른 시작

로컬 Docker 실행:

```bash
make up
make logs
make health
make chat
make down
```

k3s 배포:

```bash
make k3s-device-plugin
make k3s-apply
make k3s-wait
make k3s-port-forward
```

## 참고자료

- [vLLM Docker deployment](https://docs.vllm.ai/en/latest/deployment/docker/)
- [vLLM Kubernetes deployment](https://docs.vllm.ai/en/latest/deployment/k8s/)
- [NVIDIA Container Toolkit install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- [K3s NVIDIA Container Runtime support](https://docs.k3s.io/advanced#nvidia-container-runtime-support)
- [NVIDIA Kubernetes device plugin](https://github.com/NVIDIA/k8s-device-plugin)
