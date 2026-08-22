# LLM serving optimization은 왜 하나의 옵션으로 끝나지 않을까

Batch를 키우면 throughput은 오르지만 queue가 길어질 수 있습니다. Weight를 4 bit로 줄이면 VRAM은 줄지만 prefill이 반드시 빨라지는 것은 아닙니다. Prefix caching을 켜도 prompt 순서가 달라지면 hit가 사라집니다. **Optimization은 기능을 많이 켜는 일이 아니라, 병목과 trade-off를 맞추는 일입니다.**

이 장은 scheduling, KV cache, quantization, prefix caching이 각각 무엇을 해결하는지 구분합니다. 선택 기준은 언제나 같은 workload에서 측정한 TTFT, TPOT, throughput, VRAM, accuracy입니다.

## 먼저 구분할 지표

| 지표 | 답하는 질문 |
| --- | --- |
| TTFT | 사용자가 첫 token을 얼마나 기다리는가 |
| TPOT | 첫 token 이후 생성 속도가 얼마나 빠른가 |
| E2E latency | request 전체가 언제 끝나는가 |
| RPS | 초당 request를 몇 개 완료하는가 |
| Output TPS | 초당 output token을 몇 개 생성하는가 |
| Accuracy | 빨라진 model이 여전히 쓸 만한가 |

`TTOP`은 일반적인 serving 지표 명칭이 아닙니다. Token 생성 간격은 TPOT(Time Per Output Token) 또는 ITL(Inter-Token Latency)로 구분합니다.

## Variable-length request가 batching을 어렵게 만듭니다

Traditional ML의 static batch는 input과 output 크기가 비슷할 때 잘 동작합니다. LLM request는 prompt 길이와 output 길이가 다릅니다. 긴 request 하나가 끝날 때까지 batch 전체를 묶어 두면 먼저 끝난 slot이 놀게 됩니다.

### Dynamic batching

- dispatch 조건: max batch size 도달 또는 max delay 만료
- 장점: 짧은 시간에 들어온 request를 묶어 GPU utilization 개선
- 단점: variable-length generation에서는 가장 긴 request가 batch 완료를 지배
- 적합한 경우: 길이가 비슷한 offline 또는 traditional inference workload

### Continuous batching

- scheduling 단위: request 전체가 아니라 generation iteration
- 동작: 완료된 slot에 queued request를 바로 투입
- 장점: 서로 다른 output 길이에서 GPU idle 감소
- 단점: concurrency 증가에 따라 KV cache와 queue가 커질 수 있음
- 주요 제한값
  - `max_num_seqs`: 동시에 처리할 sequence 수의 상한
  - `max_num_batched_tokens`: iteration 전체 token budget

여기서 보통 “batch size만 크게 잡으면 throughput이 최대가 되지 않나”라고 묻습니다. GPU memory와 token budget이 부족하면 waiting request가 쌓이고 TTFT가 나빠집니다. 좋은 batch 설정은 가장 큰 값이 아니라 latency SLO를 만족하면서 throughput이 가장 높은 값입니다.

### Chunked prefill

긴 prefill은 running decode를 오래 막을 수 있습니다. Chunked prefill은 prompt를 작은 token chunk로 나눠 decode iteration 사이에 끼워 넣습니다.

- 작은 chunk
  - 얻는 것: decode blocking과 ITL 감소 가능
  - 잃는 것: scheduling overhead와 낮은 compute utilization 가능
- 큰 chunk
  - 얻는 것: prefill compute 효율
  - 잃는 것: decode blocking과 ITL 증가 가능

Online variable-length serving에서는 continuous batching을 기본으로 보고, long-context interactive workload에서 chunked prefill 크기를 측정하는 순서가 합리적입니다.

## Attention optimization은 서로 다른 층을 고칩니다

MHA, GQA, FlashAttention, PagedAttention은 모두 attention과 관련되지만 같은 문제를 해결하지 않습니다. **Architecture, kernel, memory manager를 분리해서 봐야 합니다.**

### Architecture: KV cache 자체를 줄입니다

| 방식 | KV head 구조 | 얻는 것 | 잃는 것 또는 주의점 |
| --- | --- | --- | --- |
| MHA | query head마다 KV head | 표현력 기준점 | KV cache가 큼 |
| GQA | query head group이 KV head 공유 | memory와 quality 균형 | model architecture에 고정 |
| MQA | 모든 query head가 KV head 하나 공유 | KV cache 최소화 | quality trade-off 가능 |
| MLA | latent KV representation | KV cache 압축 | 지원 model·runtime 필요 |

KV head가 줄면 token당 KV cache와 decode의 HBM data movement가 줄어듭니다. 다만 serving option으로 MHA model을 GQA model로 즉시 바꾸는 것은 아닙니다. Model architecture 선택 단계의 결정입니다.

### Kernel: HBM 왕복을 줄입니다

- kernel fusion
  - 여러 GPU operation을 한 kernel로 결합
  - 중간 tensor의 HBM write/read 감소
- FlashAttention
  - QKV matrix를 tile로 나눠 SRAM에서 계산
  - online softmax로 전체 attention matrix materialization 회피

### Memory manager: allocation waste를 줄입니다

Contiguous KV cache preallocation은 variable-length request에서 internal·external fragmentation을 만듭니다. PagedAttention은 logical block을 scattered physical block에 mapping해 마지막 block 외의 낭비를 줄입니다.

여기서 헷갈리기 쉬운 지점은 FlashAttention과 PagedAttention입니다. FlashAttention은 attention 계산 중 I/O를 줄이고, PagedAttention은 request별 KV cache를 배치하는 방식을 바꿉니다.

## Quantization은 bit 수보다 workload가 중요합니다

Quantization은 weight 또는 activation precision을 낮춰 model size, HBM data movement, compute 비용을 줄입니다. 하지만 낮은 bit가 항상 빠른 것은 아닙니다. Hardware가 해당 format을 native로 처리하는지, dequantization kernel이 효율적인지, workload가 prefill인지 decode인지가 결과를 바꿉니다.

### 오차는 어디서 생기는가

- rounding error: 표현 가능한 값 사이의 간격 때문에 가까운 값으로 변경
- clamping error: 표현 범위를 벗어난 값을 경계값으로 제한
- scaling: original range를 target range에 맞추는 과정

FP16은 exponent 5 bit와 mantissa 10 bit를 사용합니다. BF16은 exponent 8 bit와 mantissa 7 bit를 사용해 FP32와 같은 exponent 폭을 유지합니다. 같은 16 bit라도 dynamic range와 정밀도 trade-off가 다릅니다.

### W4A16과 W8A8은 목표가 다릅니다

| 방식 | 유리한 workload | 얻는 것 | 잃는 것 또는 주의점 |
| --- | --- | --- | --- |
| W4A16 | low-batch decode·memory 제약 | weight 크기 약 75% 감소 | dequantization·mixed kernel 필요 |
| W8A8 | high-batch·long prefill | weight와 activation compute 감소 | calibration 또는 dynamic scaling overhead |

- static scaling
  - 빠른 runtime
  - representative calibration dataset 필요
- dynamic scaling
  - runtime input range 반영
  - scale 계산 overhead 발생

여기서 “VRAM이 가장 적은 model을 선택하면 되지 않나”라고 묻습니다. VRAM 감소는 capacity를 늘릴 뿐 latency와 accuracy를 보장하지 않습니다. Long-prefill과 long-decode를 따로 측정하고 quality gate를 통과해야 채택할 수 있습니다.

### PTQ, QAT, distillation, pruning

- Post-Training Quantization(PTQ)
  - 장점: training 없이 적용하기 쉬움
  - 단점: 낮은 bit에서 accuracy 저하 가능
  - 권장 순서: production compression의 첫 평가 대상
- Quantization-Aware Training(QAT)
  - 장점: quantization error를 training에 반영
  - 단점: dataset과 training pipeline 비용
- Distillation
  - 장점: 작은 student model로 큰 serving 이점 가능
  - 단점: teacher 접근과 별도 training 필요
- Pruning
  - structured: hardware가 활용할 수 있는 구조 제거
  - unstructured: sparse kernel 지원이 없으면 speedup 제한
  - 2:4 sparsity: hardware 지원과 함께 평가 필요

Production에서는 quality test 정의 → PTQ variant 평가 → workload별 성능 측정 → native kernel 확인 → SLO와 quality 동시 판정 순서가 안전합니다.

## Prefix caching은 같은 내용보다 같은 token 순서를 봅니다

Response cache는 전체 input이 같아야 합니다. Prefix cache는 앞부분의 동일한 token sequence에서 계산한 KV cache를 재사용합니다. System prompt, 긴 document, 이전 대화가 반복될 때 prefill과 TTFT를 줄일 수 있습니다.

### Hit rate를 높이는 조건

- static content를 prompt 앞쪽에 배치
- dynamic user input을 뒤쪽에 배치
- whitespace, label, document order 고정
- retrieval 결과 deduplication과 stable ranking 적용

내용이 같아도 document 순서나 whitespace가 바뀌면 token prefix가 달라질 수 있습니다. Semantic similarity가 아니라 token sequence 일치가 기준입니다.

### Scale-out과 security

- round robin routing
  - 단점: prefix가 없는 replica로 이동해 local cache hit 손실
- cache-aware routing·consistent hashing
  - 장점: hit rate 증가
  - 단점: load imbalance 가능
- CPU·SSD offload
  - 장점: cache capacity 증가
  - 단점: 느린 latency 계층 추가
- tenant namespace 분리
  - 장점: tenant 간 cache 정보 노출 차단
  - 단점: shared cache hit 감소

Shared prefix의 응답 시간 차이는 side channel이 될 수 있습니다. Multi-tenant serving에서는 hit rate보다 tenant isolation이 우선입니다.

## 어떤 optimization을 먼저 고를까

| 관찰한 문제 | 먼저 검토할 선택 | 함께 확인할 지표 |
| --- | --- | --- |
| GPU idle과 낮은 throughput | continuous batching | Queue p95·RPS·Output TPS |
| 긴 prompt가 decode를 막음 | chunked prefill | Prefill p95·TTFT·TPOT |
| KV cache capacity 부족 | GQA·MQA model, PagedAttention | KV cache usage·waiting request |
| low-batch decode가 느림 | W4A16 | TPOT·Output TPS·accuracy |
| long-prefill이 느림 | W8A8·FlashAttention | Prefill time·TTFT·accuracy |
| 반복 prompt의 TTFT가 큼 | prefix caching | hit rate·TTFT·tenant boundary |

## 정리

Batching, attention kernel, quantization, prefix caching은 서로 대체하는 옵션이 아닙니다. 각각 scheduling, data movement, memory allocation, 반복 계산이라는 다른 문제를 해결합니다. **무엇을 켤지가 아니라 어떤 metric이 왜 나빠졌는지를 먼저 설명할 수 있어야 합니다.**

도입에서 본 것처럼 batch를 키우거나 bit를 낮추는 것만으로는 충분하지 않습니다. 같은 workload에서 latency, throughput, VRAM, accuracy를 함께 측정해야 optimization의 이득과 비용이 드러납니다.

## 참고자료

- *Hands-On LLM Serving and Optimization*, Chapter 6
- [vLLM Optimization and Tuning](https://docs.vllm.ai/en/stable/configuration/optimization.html)
- [vLLM Metrics](https://docs.vllm.ai/en/stable/usage/metrics/)
