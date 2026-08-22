# 16GB GPU에 7B 모델이 올라가도 serving이 어려운 이유

7B 모델의 BF16 weight는 약 14GB입니다. 16GB GPU라면 숫자상으로는 들어갈 것처럼 보입니다. 그런데 실제 serving에서는 모델이 올라가지 않거나 첫 요청부터 OOM이 발생할 수 있습니다. **GPU memory는 weight 저장 공간이 아니라 요청을 처리하는 작업 공간이기도 하기 때문입니다.**

이 장의 핵심은 GPU 사양을 외우는 것이 아닙니다. model weight, KV cache, data movement를 계산해 병목을 먼저 찾고, 그 병목에 맞는 optimization을 선택하는 것입니다.

## 빠른 결론

- GPU 선택은 FLOPS보다 workload에서 시작합니다.
- VRAM에는 weight뿐 아니라 KV cache, activation, runtime overhead가 들어갑니다.
- 긴 prefill과 token 단위 decode는 서로 다른 병목을 만듭니다.
- compute-bound에는 연산량을 줄이는 방법이 필요합니다.
- memory bandwidth-bound에는 이동할 data를 줄이는 방법이 필요합니다.
- 따라서 optimization technique보다 병목 측정이 먼저입니다.

## 왜 serving optimization이 필요한가

Training 비용은 주로 모델을 만드는 시점에 발생합니다. Inference 비용은 production request가 들어올 때마다 반복됩니다. 같은 GPU에서 처리량을 높이면 request당 비용이 내려가고, 같은 traffic을 더 적은 replica로 감당할 가능성이 생깁니다.

하지만 latency를 무조건 줄이는 것이 답은 아닙니다. 20초를 1초로 줄이는 변화와 100ms를 10ms로 줄이는 변화는 사용자 가치가 다릅니다. 먼저 목표를 다음 순서로 고정해야 합니다.

1. 실제 workload와 Service Level Objective(SLO)를 정의합니다.
2. quality를 만족하는 model을 선택합니다.
3. Time to First Token(TTFT)과 End-to-End(E2E) latency를 확인합니다.
4. 목표 latency를 만족한 뒤 throughput과 cost를 개선합니다.

여기서 보통 “가장 빠른 GPU를 쓰면 끝나지 않나”라고 묻습니다. Peak FLOPS를 workload가 사용하지 못하면 비싼 compute unit이 기다리는 시간이 늘어날 뿐입니다. GPU 가격이 아니라 실제 RPS와 token throughput으로 판단해야 합니다.

## GPU 사양은 하나의 숫자가 아닙니다

GPU를 비교할 때 FLOPS만 보면 decode 병목을 놓칩니다. **실제 serving capacity는 compute, memory capacity, memory bandwidth, interconnect, power가 함께 결정합니다.**

### Compute capability

- 확인값: FP16·BF16·FP8·INT8별 FLOPS
- 결정 대상: matrix multiplication 처리 상한
- 함정: model과 kernel이 해당 precision을 지원하지 않으면 peak 성능을 사용할 수 없음

### Memory capacity

- 확인값: VRAM 총량
- 결정 대상: weight, KV cache, activation을 동시에 적재할 수 있는지
- 함정: weight가 겨우 들어가는 상태는 serving 가능 상태가 아님

### Memory bandwidth

- 확인값: VRAM과 compute unit 사이의 초당 data 이동량
- 결정 대상: weight를 반복해서 읽는 decode 처리량
- 함정: FLOPS가 높아도 data 공급이 느리면 compute unit이 기다림

### Interconnect

- 확인값: PCIe·NVLink·NVSwitch·RDMA 대역폭과 latency
- 결정 대상: tensor·pipeline parallel에서 GPU 간 통신 비용
- 함정: independent replica에는 충분한 연결도 model sharding에서는 병목이 될 수 있음

### Power

- 확인값: GPU power limit과 rack 전력·cooling 한도
- 결정 대상: 한 rack에 배치할 수 있는 GPU 수
- 함정: chip 가격만 계산하면 facility 제약을 빠뜨림

GPU를 고를 때는 “몇 TFLOPS인가”보다 “이 workload가 어느 사양을 소모하는가”를 먼저 묻는 편이 정확합니다.

## Weight만 계산하면 OOM을 예측할 수 없습니다

Model weight의 첫 번째 근사는 간단합니다.

```text
model weight bytes = parameter count × bytes per parameter
```

- FP32: parameter당 4 byte
- FP16·BF16: parameter당 2 byte
- INT8·FP8: parameter당 1 byte
- INT4: parameter당 0.5 byte

이 계산으로 7B BF16 weight는 약 14GB입니다. 문제는 request가 들어온 뒤입니다. Transformer는 이전 token의 Key와 Value를 KV cache에 보관합니다.

Multi-Head Attention(MHA) 기준 KV cache 근사식은 다음과 같습니다.

```text
KV bytes/token = 2 × layers × KV heads × head dimension × bytes per element
total KV bytes = KV bytes/token × batch size × sequence length
```

앞의 `2`는 Key와 Value 두 tensor를 뜻합니다. Llama 2 7B의 32 layers, 32 KV heads, head dimension 128, BF16을 대입하면 token당 약 0.5MB입니다. batch 16과 sequence 4096이면 KV cache만 약 32GB가 됩니다.

실제 memory budget은 다음 항목을 함께 잡아야 합니다.

```text
weight + KV cache + activation + runtime overhead + safety margin
```

여기서 “GPU utilization을 100%로 설정하면 남는 공간을 없앨 수 있지 않나”라고 생각할 수 있습니다. 그러면 긴 context나 순간 concurrency 증가를 받아낼 여유도 없어집니다. 높은 사용률은 효율이 아니라 OOM과 안정성 사이의 선택입니다.

## Roofline은 optimization 방향을 고르는 지도입니다

Arithmetic intensity는 한 byte를 이동할 때 얼마나 많은 연산을 수행하는지 나타냅니다.

```text
arithmetic intensity = number of FLOPS / moved bytes
crossover point = peak FLOPS / memory bandwidth
```

- workload intensity가 crossover보다 낮음: memory bandwidth-bound
- workload intensity가 crossover 이상: compute-bound

FP16 matrix multiplication의 단순 근사는 다음과 같습니다.

```text
operations = 2 × M × N × K
moved bytes = 2 × (M × K + K × N + M × N)
intensity = M × N × K / (M × K + K × N + M × N)
```

Roofline은 실제 latency를 맞히는 계산기가 아닙니다. Kernel overhead, cache hit, scheduler, thermal 상태를 제외한 상한 모델입니다. 대신 “연산을 줄일 것인가, data movement를 줄일 것인가”라는 첫 방향을 정하는 데 유용합니다.

## Prefill과 decode는 같은 모델의 다른 workload입니다

Prefill은 input token 전체를 병렬 처리하고 최초 KV cache를 만듭니다. Decode는 이전 token을 이용해 새 token을 하나씩 생성합니다. 같은 Transformer라도 matrix shape와 data reuse가 달라집니다.

### Prefill

- input token을 병렬로 처리할 수 있음
- 짧은 prompt에서는 memory bandwidth-bound 가능
- 긴 prompt에서는 matrix dimension이 커져 compute-bound로 전환 가능
- 우선 관찰: prefill time, TTFT, GPU utilization

### Decode

- iteration마다 새 token 하나를 생성
- batch 1에서는 token dimension이 1에 가까움
- 큰 weight를 반복해서 읽지만 계산량은 작음
- memory bandwidth-bound 경향
- 우선 관찰: Time Per Output Token(TPOT), Output TPS, KV cache usage

여기서 “prefill이 빨라졌으니 decode도 빨라지겠지”라고 보기 쉽습니다. 하지만 prefill 개선은 TTFT에, decode 개선은 TPOT와 output throughput에 주로 나타납니다. 두 단계는 같은 benchmark 하나로 판단하면 안 됩니다.

## 병목에 따라 optimization이 달라집니다

| 병목 | 먼저 검토할 방법 | 기대 효과 | 잃는 것 또는 주의점 |
| --- | --- | --- | --- |
| Compute-bound prefill | FP8·W8A8, efficient kernel | 연산량·연산 시간 감소 | hardware·kernel 지원 필요 |
| Bandwidth-bound decode | W4A16, batching | weight 이동량 감소·data reuse 증가 | dequantization·queue latency 가능 |
| KV cache capacity | GQA·MQA, shorter context | request capacity 증가 | architecture·quality trade-off |
| Fragmentation | PagedAttention | allocation waste 감소 | runtime 구현에 의존 |
| 반복 prompt prefill | prefix caching | TTFT와 prefill 계산 감소 | hit rate·tenant isolation 필요 |

Optimization 이름을 먼저 고르면 성능이 개선되지 않아도 원인을 설명하기 어렵습니다. 병목을 먼저 고정하면 결과가 가설과 달랐을 때 kernel, scheduler, cache 중 어디를 더 확인할지도 좁힐 수 있습니다.

## 정리

16GB GPU에 7B BF16 weight가 계산상 들어가더라도 serving이 된다는 뜻은 아닙니다. request를 처리할 KV cache와 runtime 공간이 빠졌기 때문입니다. **GPU serving은 모델 크기 문제가 아니라 workload가 compute와 memory를 어떻게 소비하는지의 문제입니다.**

그래서 Chapter 6의 batching, quantization, PagedAttention, prefix caching을 보기 전에 이 장의 memory budget과 prefill·decode 병목을 먼저 이해해야 합니다.

## 참고자료

- *Hands-On LLM Serving and Optimization*, Chapter 5
- [NVIDIA GPU Performance Background User's Guide](https://docs.nvidia.com/deeplearning/performance/dl-performance-gpu-background/index.html)
