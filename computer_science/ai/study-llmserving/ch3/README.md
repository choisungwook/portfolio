# Chapter 3 LLM 서빙 시스템 설계

> 원본: https://github.com/orca3/llm-model-serving ch03

- [핵심 내용](./docs/02-core-concepts.md)
- [01. 환경 준비 링크](./01_setup/README.md)
  - [macOS 환경 준비](./01_setup/macos.md)
  - [Ubuntu RTX GPU 환경 준비](./01_setup/ubuntu_with_rtxgpu.md)
- [02. 단일 요청 처리](./02_basic/README.md)
- [03. Batching과 Sequence 추적](./03_batching/README.md)
- [04. Streaming with Batching](./04_streaming/README.md)
- [05. vLLM으로 치환](./05_vllm/README.md)
- [06. Multi-Model Serving](./06_multimodel/README.md)
- [07. Cost-optimized vs Latency-optimized](./07_tradeoff/README.md)

## 실습 원칙

- Python 3.13 사용
- uv로 Python·가상환경·패키지 관리
- Ruff formatter로 Python 2칸 들여쓰기 검증
- 02~07 실습은 실행 중인 API를 `.http`로 호출
- 02 실습은 akbun-requesthttp로도 호출 가능
- macOS는 CPU 또는 MPS, RTX 5060 Ubuntu는 CUDA 사용
