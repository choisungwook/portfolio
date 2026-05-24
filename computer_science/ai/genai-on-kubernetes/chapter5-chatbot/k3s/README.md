# K3s 전체 실습

## 문서

| 문서 | 주제 |
|---|---|
| [docs/gpu-bootstrap.md](docs/gpu-bootstrap.md) | Ubuntu NVIDIA GPU host에서 K3s GPU cluster 준비 |
| [docs/hand-on.md](docs/hand-on.md) | Chapter 5 전체 흐름 실행 |

## 코드 위치

| 경로 | 설명 |
|---|---|
| `values/jupyterhub/values.yaml` | JupyterHub Helm chart 설정 |
| `llama-finetuning/` | Qwen LoRA fine-tuning Job image |
| `inference/` | fine-tuned adapter를 읽는 inference API image |
| `notebooks/` | JupyterHub에서 실행할 notebook |
| `manifests/` | K3s용 Kubernetes manifest |
| `values/` | Helm chart values |

## 빠른 시작

GPU 부트스트랩은 [docs/gpu-bootstrap.md](docs/gpu-bootstrap.md)에서 진행한다.

전체 핸즈온은 [docs/hand-on.md](docs/hand-on.md)에서 진행한다.
