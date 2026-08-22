# Chapter 5-6 LLM serving challenge와 optimization

> 원본: *Hands-On LLM Serving and Optimization* Chapter 5-6, `llm-model-inference/ch06/quantization_3way_300.ipynb`

- [01. 환경 준비](./docs/01-setup.md)
- [02. Chapter 5 이론](./docs/02-ch5-theory.md)
- [03. Chapter 5 핸즈온](./docs/03-ch5-handson.md)
- [04. Chapter 6 이론](./docs/04-ch6-theory.md)
- [05. Chapter 6 핸즈온](./docs/05-ch6-handson.md)
- [06. GSM8K 더 공부할 것](./docs/06-gsm8k-deep-dive.md)

## 학습 판단

- Chapter 5: 학습 필요
  - GPU memory budget과 roofline 기반 병목 판단 내용임
- Chapter 6: 학습 필요
  - scheduling, KV cache, quantization, prefix caching 내용임
- 단순 Kubernetes 용어 정리: 해당 없음
- Kubernetes 환경: 제외
  - 단일 model replica 내부의 GPU·scheduler·cache 관찰이 우선임
- Chapter 5와 Chapter 6 workspace: 통합
  - Chapter 5의 병목이 Chapter 6 optimization 선택으로 바로 연결되는 구조임

## 실습 지도

| 구분 | macOS M3 Pro | Ubuntu RTX 5060 12GB |
| --- | --- | --- |
| Chapter 5 | calculator, MLX BF16 load | calculator, 7B BF16 OOM, 3B BF16 load |
| Dynamic batching | PyTorch MPS 실제 batch | PyTorch CUDA 실제 batch + Grafana |
| Quantization | MLX BF16·8bit·4bit | vLLM BF16·GPTQ W4A16·FP8 W8A8 |
| 성능 | TTFT·TPOT·E2E·Output TPS·memory | TTFT·TPOT·E2E·RPS·Output TPS·VRAM |
| Accuracy | 범위 제외 | smoke 20문항, GSM8K-20 |

## 빠른 실행

Ubuntu 환경을 점검하고 image를 build함.

```bash
make gpu-check
make build
```

7B OOM과 3B load를 실제로 확인함.

```bash
make ch5-oom
make ch5-load
```

dynamic batching 설정 차이를 비교함.

```bash
make dynamic-matrix
```

3개 precision의 성능과 accuracy를 비교함.

```bash
make quant-benchmark
make accuracy
```

container를 종료하되 model cache는 유지함.

```bash
make down
```

model cache까지 삭제할 때만 명시적으로 실행함.

```bash
make clean
```

## 설계 결정

- Notebook: 미생성
  - Python file을 단순 호출하는 Notebook은 독립적인 출력·탐색 가치 없음
- simulation: memory budget과 roofline calculator만 유지
  - 실행 가능한 주제는 실제 model·request·metric으로 검증함
- model cache: Docker named volume 사용
  - `make down` 이후 재사용함
- dashboard: Prometheus, Grafana, DCGM Exporter 사용
  - application metric과 GPU metric의 시간축 비교 목적임
