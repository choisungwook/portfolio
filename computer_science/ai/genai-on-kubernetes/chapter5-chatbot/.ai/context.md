# AI Context

## 작업 맥락

- Chapter 5 K3s hands-on은 현재 디렉터리 기준 quickstart다.
- hands-on에는 실행 순서와 명령만 남기고, 검증 이력과 의사결정 배경은 넣지 않는다.
- H2는 공통 전제, JupyterHub, Fine-tuning Qwen, fine-tuned model 배포, RAG, chatbot, 정리, 참고자료로 나눈다.
- K3s는 로컬 GPU 서버 실습이고, EKS는 실제 AWS cloud 실습이다. K3s 검증 흐름을 기준으로 `terraform/`의 EKS 실습을 고친다.

## 용어 정리

- hands-on 문서: 실행 순서와 명령만 담는 quickstart 문서.
- Qwen fine-tuning: K3s 기준 모델은 `Qwen/Qwen2.5-0.5B-Instruct`다. `llama-finetuning` 경로명이 남아 있어도 K3s workload는 Llama 3가 아니다.
- JupyterHub image: K3s notebook은 PyTorch 포함 `cschranz/gpu-jupyter:v1.10_cuda-12.9_ubuntu-24.04`를 쓴다.
- Qdrant snapshot: `catalog.snapshot`은 Qdrant/chart `1.11.5` 기준이다. `v1.18.0` 복원은 실패했고, 기존 Qdrant PVC가 남으면 재복원도 실패할 수 있다.
- K3s 검증 기준선: EKS 문서를 고칠 때 K3s에서 검증된 순서와 결과를 AWS/EKS 리소스에 맞게 옮긴다.
- K3s kubectl 접속: MacBook에서 `ubuntu` SSH tunnel과 원격 kubeconfig로 로컬 GPU 서버의 K3s API server에 붙는 방식.
- EKS kubectl 접속: 실제 AWS cloud의 EKS endpoint를 사용한다. K3s처럼 SSH tunnel 방식으로 설명하지 않는다.
