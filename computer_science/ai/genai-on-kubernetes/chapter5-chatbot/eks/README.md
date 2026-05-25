# EKS 전체 실습

## TL;DR

- Terraform은 [terraform/](terraform/)에 있다.
- EKS cluster는 `ap-northeast-2`의 default VPC와 default subnet을 사용한다.
- EKS 버전은 `1.35`다.
- managed node group은 CPU 1개, GPU 1개이며 GPU node는 Spot이다.
- 데이터셋, notebook, 모델 아티팩트는 Amazon S3 Files를 EKS PVC로 mount한다.
- Chatbot UI 접속은 기본적으로 `kubectl port-forward`를 사용한다. Ingress와 AWS Load Balancer Controller는 선택 실습으로 둔다.

## 문서

| 문서 | 주제 |
|---|---|
| [docs/hand-on.md](docs/hand-on.md) | Chapter 5 전체 흐름을 EKS에서 실행 |
| [terraform/README.md](terraform/README.md) | EKS Terraform 구성 |

## 코드 위치

| 경로 | 설명 |
|---|---|
| `terraform/` | EKS, default VPC 조회, managed node group, S3 Files |
| `helmfile.yaml.gotmpl` | Helm chart 설치를 환경 변수 기반으로 관리 |
| `values/jupyterhub/values-example.yaml` | EKS용 JupyterHub Helm values 기본값 |
| `values/qdrant/values-example.yaml` | EKS용 Qdrant Helm values 기본값 |
| `values/aws-load-balancer-controller/values-example.yaml` | AWS Load Balancer Controller Helm values 기본값 |
| `values/nvidia-device-plugin/values-example.yaml` | NVIDIA device plugin Helm values 기본값 |
| `llama-finetuning/` | Qwen LoRA fine-tuning Job 예제 코드 |
| `inference/` | fine-tuned adapter를 읽는 inference API 예제 코드 |
| `rag-app/` | RAG API 예제 코드 |
| `chatbot/` | Chatbot UI 예제 코드 |
| `notebooks/` | JupyterHub에서 실행할 notebook |
| `manifests/` | EKS용 Kubernetes manifest |

## 빠른 시작

Terraform plan까지는 아래 문서에서 진행한다.

```bash
cd computer_science/ai/genai-on-kubernetes/chapter5-chatbot
cd eks/terraform
terraform init
terraform fmt -recursive
terraform validate
terraform plan
```

`terraform apply`는 직접 실행한다.
