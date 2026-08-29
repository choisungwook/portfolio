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

### "캐시할 토큰 개수"는 예약값이지 실측값이 아닙니다

`batch size × sequence length`를 처음 보면 "지금 몇 개를 캐시하고 있는가"로 읽기 쉽습니다. 그렇지 않습니다. 이 곱은 **모든 slot이 가장 긴 sequence로 가득 찼을 때**를 가정한 최악의 경우이고, 용도는 GPU를 고르기 전에 "이 카드에 이 workload가 들어가는가"를 판단하는 것입니다.

운영 중인 engine은 반대 방향으로 움직입니다. vLLM은 기동할 때 `gpu_memory_utilization × VRAM − weight`만큼을 KV pool로 한 번에 잡고, 그것을 고정 크기 block으로 쪼개 요청에 나눠줍니다. 그래서 실행 중에 물어볼 수 있는 질문은 "이론상 얼마가 필요한가"가 아니라 **"미리 잡아둔 pool이 지금 몇 % 찼는가"**입니다.

| 질문 | 보는 값 | 언제 쓰나 |
| --- | --- | --- |
| 이 GPU에 이 workload가 들어가는가 | `KV/token × batch × sequence` | hardware 선택, 용량 계획 |
| 지금 몇 개를 실제로 캐시 중인가 | `vllm:gpu_cache_usage_perc` | 운영, 병목 판단 |
| pool이 최대 몇 token을 담는가 | `num_gpu_blocks × block_size` | 두 값을 연결할 때 |

두 값을 같은 것으로 보면 계산이 계속 안 맞습니다. 세 번째 줄이 둘을 잇는 다리입니다.

### 요청이 늘고 길어지면 KV cache가 커지는 이유

KV cache는 "요청 하나당 고정 크기"가 아니라 **살아 있는 모든 요청의 현재 길이를 합한 것**입니다.

```text
지금 쓰는 KV bytes = KV bytes/token × Σ(각 요청의 현재 token 수)
```

여기서 두 방향으로 늘어납니다. 동시 요청이 늘면 더하는 항의 개수가 늘고, prompt가 길거나 생성이 길어지면 각 항의 값이 커집니다. 그리고 결정적으로, **decode가 진행되는 동안 각 항이 계속 자랍니다.** token을 하나 만들 때마다 그 token의 Key와 Value가 cache에 쌓이기 때문입니다.

그래서 요청을 받는 순간이 아니라 **가장 긴 요청이 생성을 끝내기 직전**이 peak입니다. 시작할 때 여유가 있어 보여도 그 지점에서 OOM이 날 수 있습니다.

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

### 두 축이 각각 무엇인지부터 고정합니다

Roofline 그래프에서 축을 잘못 읽으면 그림 전체가 의미를 잃습니다.

| 축 | 단위 | 읽는 법 |
| --- | --- | --- |
| x | FLOPS/Byte | 1 byte를 옮길 때 연산을 몇 번 하는가. **workload의 성질**이지 hardware 값이 아님 |
| y | TFLOPS | 그 지점에서 hardware가 **최대로 낼 수 있는** 연산 속도 |

그림은 두 개의 천장으로 이뤄집니다. 왼쪽 대각선은 memory bandwidth 천장으로, 기울기가 곧 bandwidth입니다. x가 작으면 byte당 연산이 적어 아무리 연산 유닛이 놀아도 data가 안 와서 못 씁니다. 오른쪽 수평선은 compute 천장입니다. 두 선이 만나는 x가 crossover이고, `peak FLOPS ÷ memory bandwidth`로 구합니다.

핵심은 **crossover가 카드마다 다르다**는 것입니다. 책의 L40S는 419 FLOPS/B지만, 이 workspace의 RTX 5060 Ti에서 직접 재면 값이 다릅니다.

| 항목 | L40S (책) | RTX 5060 Ti (실측) |
| --- | ---: | ---: |
| peak BF16 | 362 TFLOPS | 50.3 TFLOPS |
| memory bandwidth | 864 GB/s | 384 GB/s |
| crossover | 419 FLOPS/B | **131 FLOPS/B** |

crossover가 낮다는 것은 연산 성능에 비해 대역폭이 상대적으로 덜 부족하다는 뜻이고, 그만큼 **더 짧은 prompt에서도 compute-bound로 넘어간다**는 뜻입니다. 같은 workload라도 카드가 바뀌면 판정이 뒤집힐 수 있으므로, 병목을 말하기 전에 자기 카드의 crossover를 먼저 구해야 합니다. 구하는 방법은 [roofline과 병목 재현](./handson/08-roofline-bottleneck.md)에 있습니다.

### decode는 sequence가 길어져도 intensity가 오르지 않습니다

prefill과 decode의 차이는 행렬 shape 하나에서 나옵니다. projection 연산을 `[s, h] × [h, h]`로 두면, prefill은 `s`가 prompt 길이만큼 크고 decode는 `s = 1`입니다. 위 공식에 넣으면 결과가 이렇게 갈립니다.

Qwen2.5-3B의 hidden size 2048로 계산한 값입니다.

| sequence 길이 | prefill intensity | decode intensity |
| ---: | ---: | ---: |
| 8 | 7.9 | 1.0 |
| 64 | 60.2 | 1.0 |
| 512 | 341.3 | 1.0 |
| 4096 | 819.2 | 1.0 |

decode 열이 변하지 않는 것이 이 장의 결론입니다. 몇 번째 token을 만들든 그 순간의 행렬은 항상 `[1, h] × [h, h]`이고, weight 전체를 읽어 곱셈을 `h²`번밖에 하지 않습니다. 그래서 **decode는 구조적으로 memory bandwidth-bound**이고, 이것이 Chapter 6의 batching이 존재하는 이유입니다. batching은 `s = 1`을 `s = batch`로 만들어 같은 weight 읽기를 여러 요청이 나눠 쓰게 합니다.

> 책 Table 5-10은 decode intensity를 0.5로 적습니다. 분모의 출력 행렬 항을 `s×h`가 아니라 `h×h`로 두면 0.5가 나옵니다. `s×h`로 계산하면 1.0입니다. 어느 쪽이든 crossover(이 카드에서 131)보다 두 자릿수 낮아 결론은 같습니다.

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

### TTFT는 감소하는 값이 아니라 한 번 찍히는 값입니다

“첫 token 이후로 응답이 점점 빨라진다”는 인상은 흔하지만, 실제로 빨라지는 것은 없습니다. 이름이 다른 두 지표가 이어 붙어 있을 뿐입니다.

| 구간 | 지표 | 무엇을 재나 | 무엇이 결정하나 |
| --- | --- | --- | --- |
| 요청 도착 ~ 첫 token | TTFT | prefill **한 번**의 시간 | prompt 길이, queue 대기, 연산량 |
| 첫 token ~ 마지막 token | TPOT | token **하나당** 시간 | weight를 읽는 memory bandwidth |

TTFT가 유독 큰 이유는 prefill이 prompt 전체를 한 번에 계산하기 때문입니다. prompt가 2,000 token이면 그 2,000개를 다 처리해야 첫 글자가 나옵니다. 반면 decode는 KV cache 덕분에 **직전 token 하나만** 계산합니다. 이미 계산해 둔 Key와 Value를 다시 쓰므로 앞의 2,000개를 다시 볼 필요가 없습니다.

그래서 “TTFT 800ms, 이후 token당 15ms” 같은 모양이 나옵니다. 15ms는 줄어드는 값이 아니라 처음부터 끝까지 대체로 일정한 값입니다. 오히려 sequence가 길어질수록 attention이 봐야 할 KV가 늘어 아주 조금씩 **늘어납니다.**

TTFT가 체감에서 중요한 이유는 계산이 아니라 화면에 있습니다. streaming 응답에서 첫 글자가 뜨는 순간 사용자는 “멈춘 화면”에서 “진행 중인 화면”으로 넘어갑니다. 총 소요 시간이 같아도 TTFT가 짧으면 더 빠르다고 느낍니다. 그래서 TTFT는 latency SLO에, TPOT와 output TPS는 capacity 계획에 씁니다.

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
