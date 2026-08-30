# 내 GPU의 crossover를 직접 재고 병목을 일부러 만들어 봅니다

책은 L40S의 사양표로 roofline을 그립니다. 사양표는 카드마다 다르고, 실제로 나오는 값은 사양표보다 낮습니다. 이 실습은 지금 꽂혀 있는 카드에서 peak 연산 성능과 memory bandwidth를 **직접 재서** roofline을 그리고, 그 위에 prefill과 decode를 올려놓습니다. 그다음 대역폭 병목과 연산 병목을 일부러 만들어 두 상황을 구분하는 방법을 확인합니다.

## 실습 환경

- 선행 실습: [배치와 시퀀스를 흔들어 KV cache가 차는 과정](./03-kv-cache-batch-sequence.md)
- 실행 workspace: `computer_science/ai/study-llmserving/ch5-6`
- GPU: NVIDIA GeForce RTX 5060 Ti 16GB
- 이론: [16GB GPU에 7B 모델이 올라가도 serving이 어려운 이유](../02-ch5-theory.md)

Repository root에서 workspace로 이동합니다.

```bash
cd computer_science/ai/study-llmserving/ch5-6
```

## 실습 전 GPU process를 정리합니다

이전 실습과 다른 workload가 사용하는 GPU compute process를 정리합니다.

```bash
docker compose --profile "*" down --remove-orphans
nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader
```

두 번째 명령이 process를 출력하면 실습을 진행하지 않습니다. [실행 주체 확인과 안전한 종료 절차](../troubleshooting.md#실습-전-gpu-기준-상태를-만듭니다)를 수행한 뒤 두 명령을 다시 실행합니다.

## 1. 축이 무엇인지부터 고정합니다

Roofline 그래프를 처음 보면 축을 읽는 것부터 막힙니다. 두 축은 서로 다른 것을 잽니다.

| 축 | 단위 | 무엇인가 |
| --- | --- | --- |
| x | FLOPS/Byte | **workload의 성질**. 1 byte를 옮길 때 연산을 몇 번 하는가 |
| y | TFLOPS | **hardware의 상한**. 그 x에서 최대로 낼 수 있는 연산 속도 |

x는 GPU를 바꿔도 변하지 않습니다. 행렬 크기가 정하기 때문입니다. y의 천장만 GPU에 따라 달라집니다. 그래서 "이 workload는 x가 얼마인가"와 "이 카드의 천장은 어디서 꺾이는가"를 따로 구한 뒤 겹쳐 보는 것이 roofline입니다.

꺾이는 지점이 crossover이고 계산은 나눗셈 하나입니다.

```text
crossover = peak FLOPS ÷ memory bandwidth
```

## 2. 이 카드의 천장을 잽니다

사양표를 믿지 않고 측정합니다. 큰 정사각 행렬 곱으로 peak 연산 성능을, 큰 device 복사로 memory bandwidth를 잽니다.

```bash
docker compose --profile tools build benchmark
docker compose --profile tools run --rm gpu-probe
docker compose --profile tools run --rm benchmark python3 -m calculators.plot_roofline
```

측정 결과입니다.

| 항목 | L40S (책 사양표) | RTX 5060 Ti (실측) |
| --- | ---: | ---: |
| peak BF16 | 362 TFLOPS | 50.3 TFLOPS |
| memory bandwidth | 864 GB/s | 384 GB/s |
| **crossover** | **419 FLOPS/B** | **131 FLOPS/B** |

crossover가 131이라는 것은 이 카드가 연산 성능 대비 대역폭이 상대적으로 덜 부족하다는 뜻입니다. 결과적으로 **책보다 짧은 prompt에서도 compute-bound로 넘어갑니다.**

`results/roofline.png`에 그래프가 저장됩니다. 검은 선이 천장이고 점이 실제 측정값입니다.

## 3. 같은 workload가 카드에 따라 다르게 판정됩니다

Projection 연산을 `[s, h] × [h, h]`로 두고 계산기를 돌립니다.

```bash
docker compose --profile tools run --rm benchmark python3 -m calculators.memory_budget
docker compose --profile tools run --rm benchmark python3 -m calculators.roofline
```

책 예제와 맞추기 위해 hidden size 4096으로 계산한 값입니다. [이론 문서](../02-ch5-theory.md)의 표는 이 workspace가 실제로 서빙하는 Qwen2.5-3B의 2048 기준이라 같은 sequence 길이라도 값이 다릅니다.

| sequence 길이 | intensity | L40S 판정 | RTX 5060 Ti 판정 |
| ---: | ---: | --- | --- |
| 1 (decode) | 1.0 | memory bandwidth-bound | memory bandwidth-bound |
| 64 | 62.1 | memory bandwidth-bound | memory bandwidth-bound |
| 512 | 409.6 | memory bandwidth-bound | **compute-bound** |
| 4096 | 1365.3 | compute-bound | compute-bound |

`s=512` 행에서 판정이 뒤집힙니다. intensity는 두 카드에서 똑같이 409.6인데 천장의 위치가 다르기 때문입니다. **"prefill은 compute-bound"라는 문장은 카드를 말하지 않으면 반쪽짜리입니다.**

decode 행이 sequence 길이와 무관하게 1.0으로 고정되는 것이 이 장의 결론입니다. 몇 번째 token을 만들든 그 순간의 행렬은 항상 `[1, h] × [h, h]`입니다.

## 4. Roofline이 맞히지 못하는 것도 봅니다

그래프에서 작은 행렬(64, 128, 256)은 천장에서 한참 아래에 찍힙니다.

| 행렬 크기 | intensity | 천장이 허용하는 값 | 실측 |
| ---: | ---: | ---: | ---: |
| 64 | 21.3 | 8.2 TFLOPS | 0.02 TFLOPS |
| 512 | 170.7 | 50.3 TFLOPS | 9.36 TFLOPS |
| 4096 | 1365.3 | 50.3 TFLOPS | 46.16 TFLOPS |

작은 행렬은 계산 자체가 수십 마이크로초라 kernel을 띄우는 비용이 전부를 차지합니다. 대역폭 때문에 느린 것이 아닙니다. **Roofline은 상한선이지 latency 예측기가 아닙니다.** 이 구분을 놓치면 "roofline이 틀렸다"는 결론으로 갑니다.

## 5. Decode의 이론 상한을 계산합니다

병목을 지표로 추측하는 대신 산수로 못박을 수 있는 지점이 하나 있습니다. batch 1에서 token 하나를 만들려면 **model weight 전체를 한 번 읽어야** 합니다. 그러면 상한이 나옵니다.

```text
batch 1 decode 상한(token/s) = memory bandwidth ÷ weight bytes
```

Qwen2.5-3B BF16의 weight는 vLLM이 보고한 값으로 5.79 GiB입니다.

```text
384 GB/s ÷ 6.18 GB = 약 62 token/s
```

이 숫자가 중요한 이유는, 실측 token 생성 속도가 여기에 가깝게 붙으면 **대역폭 병목이라는 것이 추측이 아니라 증명**이 되기 때문입니다. 연산을 아무리 빠르게 만들어도 이 선을 넘을 수 없습니다.

넘는 방법은 하나뿐입니다. weight를 한 번 읽어서 여러 요청이 나눠 쓰는 것, 곧 batching입니다. Chapter 6가 여기서 시작합니다.

## 6. 병목 두 개를 일부러 만듭니다

vLLM을 띄우고 서로 반대쪽에 있는 workload를 던집니다.

```bash
docker compose --profile bf16 up -d vllm-bf16
docker compose --profile observability up -d prometheus grafana dcgm-exporter
docker compose --profile tools build benchmark
docker compose --profile tools run --rm \
  -e MEASURED_BANDWIDTH_GBPS=384 \
  benchmark python3 -m benchmark.bottleneck_probe
```

실험이 만드는 네 상황입니다.

| 시나리오 | 동시성 | prompt | 생성 | 노리는 것 |
| --- | ---: | ---: | ---: | --- |
| decode-bound | 1 | 32 | 512 | 시간 대부분이 decode. 대역폭 병목 |
| decode-bound-batched | 16 | 32 | 512 | 같은 decode를 batch로 나눠 쓰기 |
| prefill-bound | 8 | 3584 | 1 | 시간 대부분이 prefill. 연산 병목 |
| mixed | 8 | 512 | 128 | 실제 chat에 가까운 혼합 |

실측 결과입니다.

| 시나리오 | 요청당 token/s | 이론 상한 대비 | 전체 Output TPS | GPU util | Memory util |
| --- | ---: | ---: | ---: | ---: | ---: |
| decode-bound (동시성 1) | 62.5 | **1.01** | 62 | – | – |
| decode-bound-batched (동시성 16) | 59.7 | 0.96 | **955** | 25% | 24% |
| prefill-bound (prompt 3584) | – | – | – | 100% | 96% |
| mixed | 48.1 | 0.77 | 385 | 100% | 96% |

첫 두 줄이 이 실습의 핵심입니다. **동시성을 1에서 16으로 올려도 요청 하나의 속도는 62.5에서 59.7로 거의 그대로인데, 전체 처리량은 62에서 955로 15배가 됩니다.** 같은 weight 읽기를 16개 요청이 나눠 썼기 때문입니다. 대역폭 병목을 우회하는 방법이 batching이라는 것이 이 두 줄에 있습니다.

상한 대비 1.01은 측정값이 이론값을 1% 넘었다는 뜻입니다. 일부 weight가 L2에 남아 재사용되거나, 복사로 잰 대역폭이 순수 읽기 대역폭을 조금 낮게 잡았기 때문으로 볼 수 있습니다. **이 상한은 법칙이 아니라 근사 모델입니다.** 다만 1% 오차로 맞는 근사라면 병목을 지목하는 근거로는 충분합니다.

## 7. MEM_COPY_UTIL로 구분하려 했지만 실패했습니다

`DCGM_FI_DEV_GPU_UTIL`은 "SM에 할 일이 배정된 시간 비율"이라 데이터를 기다리며 멈춰 있어도 올라갑니다. 그래서 `DCGM_FI_DEV_MEM_COPY_UTIL`을 겹치면 방향이 보일 것이라 기대했습니다. 위 표의 오른쪽 두 열이 그 결과입니다.

**두 값이 거의 같이 움직입니다.** 연산 병목을 노리고 만든 prefill 시나리오에서도 memory util이 96%로 높습니다. 이 카드에서 이 조합만으로는 병목이 갈리지 않습니다.

이유는 정의에 있습니다. 두 지표 모두 "그 시간 동안 바빴는가"를 재는 시간 비율이지 "대역폭의 몇 퍼센트를 썼는가"가 아닙니다. 후자를 재려면 `DCGM_FI_PROF_DRAM_ACTIVE` 같은 profiling 지표가 필요한데, GeForce 계열에는 노출되지 않습니다. 이 workspace의 DCGM exporter가 내보내는 지표 목록으로 직접 확인할 수 있습니다.

```bash
curl -s localhost:9400/metrics | grep "^# HELP" | grep PROF
```

아무것도 나오지 않습니다.

**그래서 판별은 지표가 아니라 5절의 산수로 합니다.** Grafana의 `Compute vs Bandwidth pressure` panel은 여전히 유용한데, 두 값이 함께 낮은 세 번째 경우 곧 GPU가 노는 상황을 잡아주기 때문입니다. 그때는 client 동시성이나 queue를 봐야 합니다.

## 정리

- crossover는 카드마다 다르므로 병목을 말하기 전에 자기 카드에서 먼저 잰다.
- x축은 workload가, y축의 천장은 hardware가 정한다.
- decode의 intensity는 sequence 길이와 무관하게 고정이라 구조적으로 대역폭 병목이다.
- GPU utilization과 memory utilization을 겹쳐도 이 카드에서는 두 병목이 갈리지 않았다.
- 대신 대역폭에서 나온 이론 상한과 실측 token 속도를 비교하면 1% 오차로 판별된다.
- batching은 요청당 속도를 거의 그대로 두면서 전체 처리량만 15배로 올린다.

## 참고자료

- *Hands-On LLM Serving and Optimization*, Chapter 5
- [Chapter 5 이론](../02-ch5-theory.md)
- [metric 해석](../prometheus.md)
