# Chapter 5 핸즈온

## 진행 순서

- 환경 준비: [01-setup.md](./01-setup.md)
- 목적: 실행 전 계산과 실제 GPU 결과의 차이 확인
- simulation: 미사용
- 예외: memory budget과 roofline은 의사결정용 calculator로 유지

## 1. Serving optimization의 가치

### 확인할 가설

- latency SLO 충족 후 RPS 증가가 필요한 replica와 request당 cost를 낮춤
- 실제 benchmark 전에는 비용 효과를 확정할 수 없음

### macOS와 Ubuntu 공통

Chapter 6 benchmark 완료 후 `results/summary.md`의 RPS를 사용함.

```text
required replicas = ceil(target RPS / measured RPS per replica)
monthly cost = required replicas × hourly GPU cost × monthly hours
cost per request = monthly cost / monthly requests
```

비교 조건을 고정함.

- 동일 model family
- 동일 workload
- 동일 concurrency
- 동일 SLO
- 동일 accuracy gate

### 관찰

- RPS만 높은 variant: accuracy 또는 TTFT SLO 실패 가능
- replica 감소가 없는 작은 RPS 개선: 즉시 비용 절감으로 이어지지 않을 수 있음
- 성능 표와 quality 표를 함께 보는 이유임

### 코드 10초 설명

- Chapter 6 client가 실제 request 수와 elapsed time으로 RPS 계산
- summary가 performance와 accuracy 결과를 한 행에 결합
- 그 값을 infrastructure capacity 계산 입력으로 사용

## 2. GPU spec을 workload 관점에서 읽기

### 확인할 가설

- VRAM capacity는 model 실행 가능 여부 결정
- memory bandwidth와 compute capability는 실행 후 속도 결정

### macOS Apple Silicon

SoC와 unified memory를 확인함.

```bash
system_profiler SPHardwareDataType
```

- M3 Pro 36GB: 3B BF16 적재 가능
- unified memory: CPU와 GPU가 같은 memory pool 공유
- CUDA·vLLM kernel: 비교 불가
- MLX: Apple Silicon 실측 경로

### Ubuntu with RTX 5060

GPU, driver, VRAM, power limit를 확인함.

```bash
nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free,power.limit --format=csv
```

container 내부 GPU 접근을 확인함.

```bash
make gpu-check
```

### 관찰

- 12GB VRAM: Qwen2.5-7B BF16 weight 약 14.2GiB보다 작음
- 3B BF16 weight 약 5.6GiB: runtime·KV cache 공간 확보 가능
- `GPU-Util` 하나만으로 compute-bound와 memory-bound 판정 불가

### 코드 10초 설명

- `nvidia-smi`가 host driver와 physical GPU 상태 출력
- CUDA container가 host driver를 통해 동일 GPU 접근
- model load 결과가 spec 기반 예상 검증

## 3. GPU memory budget과 실제 OOM

### 확인할 가설

- `parameter × bytes` 계산으로 7B BF16 OOM을 실행 전에 예측 가능
- model weight 적재 성공이 serving capacity 확보를 의미하지 않음

### 공통 calculator

weight와 KV cache budget을 계산함.

```bash
make ch5-calculate
```

주요 출력의 의미임.

| Precision | 7B weight 근사 | 12GB GPU 해석 |
| --- | ---: | --- |
| BF16 | 약 14.2GiB | weight 단독 OOM 예상 |
| FP8·INT8 | 약 7.1GiB | KV cache·runtime 검증 필요 |
| INT4 | 약 3.5GiB | 더 큰 batch·context 여유 예상 |

### macOS Apple Silicon

실제 MLX BF16 model을 load하고 generation함.

```bash
uv run --group mac python -m macos.benchmark_bf16
```

- model: `mlx-community/Qwen2.5-3B-Instruct-bf16`
- 결과: `results/macos-bf16.json`
- 관찰: TTFT, TPOT, E2E, Output TPS, peak unified memory
- 36GB 환경에서 7B OOM 재현: 실습 목표 아님

### Ubuntu with RTX 5060

Grafana의 VRAM panel을 함께 열어 둠.

```bash
make observability-up
```

7B BF16 model의 실제 CUDA OOM을 확인함.

```bash
make ch5-oom
```

- 성공 조건: CUDA OOM 발생
- 실패 조건: model load 성공 또는 network·format 등 다른 오류
- 결과: `results/ch5-7b-bf16-oom.json`

3B BF16 model의 실제 CUDA load를 확인함.

```bash
make ch5-load
```

- 성공 조건: model이 CUDA로 이동
- 결과: `results/ch5-3b-bf16-load.json`
- 확인값: elapsed time, peak allocated VRAM, peak reserved VRAM

### 관찰

- 7B BF16 OOM: 계산 결과와 실제 실행 일치
- 3B BF16 load: 남은 VRAM이 KV cache와 request concurrency budget
- peak allocated와 reserved 차이: allocator가 재사용을 위해 보유한 memory

### 코드 10초 설명

- Hugging Face model을 BF16으로 load한 뒤 CUDA로 이동
- CUDA allocator의 peak allocated·reserved memory 기록
- 7B는 OOM일 때만, 3B는 load 성공일 때만 command 성공

## 4. Roofline으로 병목 가설 만들기

### 확인할 가설

- 긴 prefill과 batch 1 decode의 arithmetic intensity가 다름
- calculator 결과는 측정 전 가설이며 최종 성능 결과가 아님

### macOS와 Ubuntu 공통

단순 Transformer projection의 arithmetic intensity를 계산함.

```bash
uv run python -m calculators.roofline
```

출력에서 crossover와 workload intensity를 비교함.

- intensity < crossover: memory bandwidth-bound 가설
- intensity >= crossover: compute-bound 가설
- 긴 prefill: compute-bound 전환 가능
- batch 1 decode: memory bandwidth-bound 경향

### 코드 10초 설명

- peak FLOPS를 memory bandwidth로 나누어 crossover 계산
- matrix operation과 data movement로 workload intensity 계산
- 두 값을 비교해 다음 optimization 후보 선택

## 5. Prefill과 decode를 실제 metric으로 구분

### 확인할 가설

- long-prefill workload는 TTFT 차이를 크게 노출
- long-decode workload는 TPOT와 Output TPS 차이를 크게 노출

### macOS Apple Silicon

BF16의 두 workload를 한 번에 실행함.

```bash
uv run --group mac python -m macos.benchmark_bf16
```

`results/macos-bf16.json`의 두 workload를 비교함.

- `long-prefill`: TTFT 중심
- `long-decode`: TPOT 중심
- RPS: single-process sequential MLX 범위에서 제외

### Ubuntu with RTX 5060

Chapter 6의 3-way 실제 benchmark를 실행함.

```bash
make quant-benchmark
```

`results/summary.md`에서 같은 model의 두 workload를 비교함.

- long-prefill: W8A8의 compute 이점 확인 대상
- long-decode: W4A16의 weight bandwidth 이점 확인 대상
- 결과가 가설과 다름: kernel support·overhead·GPU 특성 확인 필요

### 코드 10초 설명

- long-prefill은 긴 input과 짧은 output 사용
- long-decode는 짧은 input과 긴 output 사용
- streaming response의 첫 token과 이후 token 시간을 분리

## 완료 기준

- 7B BF16 OOM을 byte 계산과 실제 결과로 설명 가능
- 3B load 성공 뒤에도 KV cache budget이 필요한 이유 설명 가능
- roofline 결과를 확정값이 아닌 병목 가설로 사용 가능
- TTFT와 TPOT가 서로 다른 phase를 보는 이유 설명 가능
