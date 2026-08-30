# 배치와 시퀀스를 흔들어 KV cache가 실제로 어떻게 차는지 봅니다

Chapter 5는 KV cache 크기를 `token당 bytes × 최대 배치 × 최대 시퀀스`로 추정합니다. 이 실습은 그 공식이 얼마나 맞는지 실제 서버에서 확인하고, 어디서부터 어긋나는지, 어긋나는 이유가 무엇인지 봅니다. 결론부터 말하면 공식은 정확하지만 **적용 범위가 따로 있습니다.**

## 실습 환경

- 선행 실습: [16GB GPU에서 7B BF16이 OOM 나는 이유](./02-memory-budget-oom.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB
- Model: Qwen2.5-3B-Instruct BF16, `max-model-len 4096`

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

## 1. 먼저 token 하나의 비용을 구합니다

Model config에서 네 값만 있으면 됩니다.

```text
KV bytes/token = 2 × layers × KV heads × head dimension × dtype bytes
```

Qwen2.5-3B-Instruct는 layers 36, KV heads 2, head dimension 128, BF16입니다.

```text
2 × 36 × 2 × 128 × 2 = 36,864 bytes = 36 KiB
```

책 예제의 Llama-2-7B는 같은 계산으로 **512 KiB**가 나옵니다. 14배 차이입니다. parameter 수가 2배 차이인데 KV는 14배 차이가 나는 이유는 KV head 수에 있습니다. Llama-2-7B는 attention head 32개마다 KV head도 32개인 MHA이고, Qwen2.5-3B는 attention head 16개가 KV head 2개를 나눠 쓰는 GQA입니다.

```bash
make ch5-calculate
```

| Model | attention | KV heads | KV/token | 같은 16GB에서 4096-token 요청 |
| --- | --- | ---: | ---: | ---: |
| Llama-2-7B | MHA | 32 | 512 KiB | 0개 |
| Qwen2.5-3B | GQA | 2 | 36 KiB | 약 61개 |

**KV cache 용량은 모델 크기가 아니라 attention 구조가 결정합니다.**

## 2. 공식을 뒤집으면 vLLM의 자체 계산과 맞습니다

vLLM은 기동할 때 KV pool을 미리 잡고 그 크기를 log에 남깁니다.

02번에서 실행한 3B BF16 server가 내려갔다면 다시 기동하고 health check를 확인합니다.

```bash
make vllm-bf16
bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
```

```bash
docker compose --profile bf16 logs vllm-bf16 | grep -i "KV cache"
```

실제 출력입니다.

```text
Available KV cache memory: 6.76 GiB
GPU KV cache size: 196,896 tokens
Maximum concurrency for 4,096 tokens per request: 48.07x
```

여기에 1절의 36,864 bytes를 곱해 봅니다.

```text
196,896 tokens × 36,864 B = 6.76 GiB      (vLLM: 6.76 GiB)
196,896 ÷ 4,096            = 48.07         (vLLM: 48.07x)
```

소수점까지 같습니다. 책의 공식과 vLLM이 같은 산수를 하고 있고, 방향만 반대입니다. 책은 "이만큼 필요하다"를 구하고, vLLM은 "이만큼 잡았으니 이만큼 담긴다"를 구합니다.

VRAM 전체가 어떻게 갈라지는지도 여기서 맞춰볼 수 있습니다.

| 항목 | `utilization 0.9` | `utilization 0.85` |
| --- | ---: | ---: |
| GPU 전체 | 15.93 GiB | 15.93 GiB |
| 적용 예산 | 14.34 GiB | 13.54 GiB |
| model weight | 5.79 GiB | 5.79 GiB |
| KV pool | 6.76 GiB | 5.95 GiB |
| 나머지 (activation, CUDA graph, allocator) | 약 1.79 GiB | 약 1.80 GiB |
| 4096-token 요청 최대 동시성 | 48.07 | 42.32 |

`gpu-memory-utilization`을 0.05만 내렸는데 KV pool이 0.81 GiB 줄고 최대 동시성이 6 감소합니다. weight와 나머지는 고정이라 **줄어든 예산이 통째로 KV pool에서 빠지기 때문입니다.** 이 workspace의 기본값은 0.85인데, 이유는 아래 6절에 있습니다.

계산기가 예측한 batch 61과 vLLM의 48 차이가 바로 이 "나머지"와 10% 여유분입니다. **weight만 계산하면 안 되는 이유가 이 표에 다 있습니다.**

## 3. 배치와 시퀀스를 흔듭니다

동시 요청 수와 prompt 길이를 바꿔가며, 공식이 예측한 pool 점유율과 서버가 보고하는 실제 점유율을 나란히 놓습니다.

```bash
make ch5-kv-probe
```

`max_num_seqs 8` 기본 설정에서의 결과입니다.

| 동시성 | prompt | running | waiting | 예측 KV% | 실측 KV% | TTFT p95 | TPOT p50 | Output TPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 256 | 1 | 0 | 0.20% | 0.21% | 74 ms | 15.9 ms | 60 |
| 4 | 256 | 4 | 0 | 0.78% | 0.81% | 184 ms | 15.9 ms | 229 |
| 8 | 256 | 8 | 0 | 1.56% | 1.56% | 352 ms | 16.2 ms | 420 |
| 8 | 2048 | 8 | 3 | 8.84% | 8.91% | 2,257 ms | 21.8 ms | 227 |
| 16 | 2048 | 8 | 11 | 17.68% | **8.91%** | 6,669 ms | 26.0 ms | 229 |
| 32 | 2048 | 8 | 27 | 35.36% | **8.93%** | 15,584 ms | 26.3 ms | 229 |
| 48 | 2048 | 8 | 43 | 53.05% | **8.93%** | 23,908 ms | 28.3 ms | 229 |

## 4. 위 표에서 읽어야 할 네 가지

### 공식은 맞습니다, 단 admit된 요청에만

위 네 줄에서 예측과 실측이 소수점 둘째 자리까지 붙습니다. 아래 세 줄에서 예측만 계속 올라가고 실측은 8.9%에 멈춥니다. **대기 중인 요청은 KV cache를 한 byte도 쓰지 않기 때문입니다.** scheduler에 admit되어야 block이 할당됩니다.

그래서 실측 점유율이 예측보다 낮을 때 "메모리가 남는다"고 읽으면 안 됩니다. 오히려 **scheduler가 막고 있다**는 신호입니다.

### 최대 배치 크기는 둘 중 낮은 쪽입니다

`running`이 8에서 더 올라가지 않습니다. `max_num_seqs 8`이 천장이기 때문입니다. KV pool은 8.9%밖에 안 찼으니 메모리는 한참 남았습니다.

```text
실제 최대 배치 = min(max_num_seqs, KV pool이 담을 수 있는 요청 수)
```

이 설정에서는 앞쪽이, `max_num_seqs`를 충분히 올리면 뒤쪽이 천장이 됩니다. **어느 쪽이 천장인지 모르면 엉뚱한 knob을 돌리게 됩니다.**

### 늘어난 부하는 전부 TTFT로 갑니다

동시성을 8에서 48로 6배 올렸는데 Output TPS는 229에서 그대로입니다. 처리량이 1도 늘지 않았습니다. 대신 TTFT p95가 2.2초에서 **23.9초**가 됐습니다.

`waiting`이 43이라는 것은 43개 요청이 아무 일도 못 하고 줄 서 있다는 뜻이고, 그 대기 시간이 통째로 TTFT에 들어갑니다. 이것이 TTFT를 latency SLO의 대표로 쓰는 이유입니다. 사용자가 겪는 것은 GPU 사용률이 아니라 이 24초입니다.

### TPOT는 거의 움직이지 않습니다

TTFT가 300배 흔들리는 동안 TPOT는 15.9 ms에서 28.3 ms로 완만하게만 늘었습니다. 두 지표는 서로 다른 것을 재고 있습니다. TTFT는 prefill과 queue를, TPOT는 token 하나를 만드는 비용을 잽니다.

짧은 prompt에서 TPOT 15.9 ms는 초당 62.9 token이고, 이 값은 [04번 실습](./04-roofline-bottleneck.md)에서 memory bandwidth로 계산한 이론 상한 62.1 token/s와 거의 같습니다. **decode가 대역폭에 붙어 있다는 증거입니다.**

## 5. 천장을 옮기면 공식이 다시 맞습니다

앞의 어긋남이 정말 scheduler 때문이었는지 확인하려면 천장만 옮겨 보면 됩니다. `max_num_seqs`를 64로 올리고 같은 스윕을 돌립니다.

```bash
VLLM_MAX_NUM_SEQS=64 docker compose --profile bf16 up -d --force-recreate vllm-bf16
make ch5-kv-probe
```

이 설정에서는 `gpu-memory-utilization`이 0.85라 pool이 173,328 tokens(5.95 GiB)로 조금 작아집니다. 예측값은 그 pool 기준입니다.

| 동시성 | prompt | running | 예측 KV% | 실측 KV% | TTFT p95 | TPOT p50 | Output TPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 256 | 1 | 0.22% | 0.23% | 346 ms | 16.0 ms | 53 |
| 4 | 256 | 4 | 0.89% | 0.92% | 193 ms | 15.8 ms | 229 |
| 8 | 256 | 8 | 1.77% | 1.85% | 353 ms | 16.0 ms | 423 |
| 8 | 2048 | 8 | 10.04% | 10.12% | 2,268 ms | 21.9 ms | 227 |
| 16 | 2048 | **16** | 20.09% | **20.25%** | 4,547 ms | 32.2 ms | 293 |
| 32 | 2048 | **32** | 40.17% | **40.29%** | 8,923 ms | 53.9 ms | 340 |
| 48 | 2048 | **48** | 60.26% | **60.34%** | 13,493 ms | 78.2 ms | 351 |

`running`이 이제 동시성을 그대로 따라가고, **예측과 실측이 모든 행에서 다시 붙습니다.** 앞 절의 어긋남은 공식이 틀려서가 아니라 admit되지 않은 요청을 세었기 때문이라는 것이 확인됩니다.

### 같은 부하, 다른 설정의 대가

두 설정을 같은 부하(동시성 48, prompt 2048)에서 비교합니다.

| | `max_num_seqs 8` | `max_num_seqs 64` |
| --- | ---: | ---: |
| Output TPS | 229 | **351** (+53%) |
| TPOT p50 | 28.3 ms | **78.2 ms** (2.8배) |
| TTFT p95 | 23.9 s | **13.5 s** |
| KV pool 점유 | 8.9% | 60.3% |

batch를 크게 잡으면 같은 weight 읽기를 더 많은 요청이 나눠 쓰므로 처리량이 오릅니다. 대신 한 요청이 GPU를 독점하는 시간이 줄어 **token 하나가 나오는 간격이 2.8배로 늘어납니다.**

**처리량과 token 지연은 같은 knob의 양쪽 끝입니다.** 어느 쪽을 고를지는 SLO가 정합니다. 채팅처럼 사람이 읽는 속도가 중요하면 TPOT를, 배치 처리처럼 총량이 중요하면 Output TPS를 지킵니다.

## 6. gpu-memory-utilization은 전체 VRAM 기준입니다

이 실습을 desktop이 떠 있는 machine에서 하면 이 오류를 만날 수 있습니다.

```text
ValueError: Free memory on device cuda:0 (13.83/15.45 GiB) on startup is less
than desired GPU memory utilization (0.9, 13.9 GiB).
```

Xorg와 gnome-shell이 VRAM을 약 1.6 GiB 쓰고 있어 여유가 13.83 GiB인데, `0.9`는 여유가 아니라 **전체 15.45 GiB에 곱해져** 13.9 GiB를 요구합니다. 0.07 GiB 차이로 기동이 실패합니다.

이 workspace는 값을 환경변수로 받고 기본값을 `0.85`로 둡니다.

```bash
VLLM_GPU_MEMORY_UTILIZATION=0.85 docker compose --profile bf16 up -d vllm-bf16
```

같은 값을 headless server에 쓰면 KV pool이 그만큼 작아지므로, 결과를 비교할 때는 이 값을 반드시 함께 적어야 합니다. **"GPU 사용률을 100%로 올리면 되지 않나"에 대한 실물 답이 이 오류입니다.**

## 7. 시퀀스 길이는 pool을 쓰는 속도를 바꿉니다

동시성 8을 고정하고 prompt만 256에서 2048로 늘리면 실측 KV가 1.56%에서 8.91%로 늘어납니다. 요청 수는 그대로인데 각 요청이 차지하는 자리가 길어졌기 때문입니다.

`--max-model-len`은 이 자리의 상한을 정합니다. 이 값을 올리면 요청 하나가 최악의 경우 차지할 수 있는 자리가 커지고, vLLM이 계산하는 최대 동시성이 그만큼 줄어듭니다. 위 log의 `Maximum concurrency ... 48.07x`가 4,096을 기준으로 나온 값이라, `max-model-len`을 2,048로 줄이면 96배로 늘어납니다.

**긴 context를 지원하는 비용은 GPU 메모리가 아니라 동시 사용자 수로 지불됩니다.**

## 8. Grafana에서 같은 장면을 봅니다

`KV pool occupancy vs admitted requests` panel이 세 선을 한 화면에 그립니다.

| 선 | 무엇을 보나 |
| --- | --- |
| KV pool used % | 실제로 캐시된 양 |
| running | admit되어 GPU를 쓰는 요청 수 |
| waiting | 줄 서 있는 요청 수 |

`running`이 평평해지고 `waiting`이 올라가기 시작하는 지점이 이 workload의 실제 최대 배치 크기입니다. 그때 KV pool used %가 낮으면 `max_num_seqs`가, 높으면 메모리가 천장입니다.

## 정리

- KV/token은 attention 구조가 정한다. GQA와 MHA는 같은 GPU에서 용량이 십수 배 다르다.
- 책의 공식과 vLLM의 pool 계산은 같은 산수이고 방향만 반대다.
- 공식은 admit된 요청에만 적용된다. 대기 요청은 KV를 쓰지 않는다.
- 최대 배치는 `max_num_seqs`와 pool 용량 중 낮은 쪽이다.
- 천장을 넘은 부하는 처리량이 아니라 TTFT로 나타난다.
- 천장을 올리면 처리량이 오르는 대신 token 지연이 늘어난다. 어느 쪽을 지킬지는 SLO가 정한다.

## 참고자료

- *Hands-On LLM Serving and Optimization*, Chapter 5
- [Chapter 5 이론](../02-ch5-theory.md)
- [metric 해석](../prometheus.md)
