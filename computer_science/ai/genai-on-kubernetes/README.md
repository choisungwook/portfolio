# 목표

- Kubernetes-for-Generative-AI-Solutions 책 5장 실습을 따라 kubernetes 위에서 생성형 AI 서비스를 구성하는 과정을 정리
- 실습 범위는 JupyterHub 기반 실험 환경, LoRA 파인튜닝, AI 모델 API 배포, Qdrant 기반 RAG, 챗봇 UI
- 책과 달리 kubernetes 리소스는 Terraform 대신 `kubectl`과 Helm으로 배포

## 문서  목차

| 문서 | 주제 |
|---|---|
| [k3s docs/gpu-bootstrap.md](docs/gpu-bootstrap.md) | k3s 실습을 위해 Ubuntu NVIDIA GPU host에서 K3s GPU cluster 준비 |
| [k3s docs/hand-on.md](docs/hand-on.md) | k3s에서  Chapter 5 전체 흐름 실행 |
