# Chapter 5-6 Quiz

## Chapter 5 스스로 이해하는 질문

1. 질문: latency를 무조건 줄이는 것이 좋은가?
   - 답: 아님. 사용자 체감 SLO를 이미 만족하면 throughput과 cost 개선의 가치가 더 큼
2. 질문: peak FLOPS가 가장 높은 GPU가 항상 최선인가?
   - 답: 아님. model 적재 가능 여부와 workload의 memory bandwidth 요구, interconnect 비용까지 함께 판단 필요
3. 질문: 7B BF16 model weight의 대략적인 크기는 얼마인가?
   - 답: `7 billion × 2 byte = 약 14 GB`임
4. 질문: 16 GB GPU에 14 GB model이 들어가면 운영에 충분한가?
   - 답: 대체로 부족함. KV cache, activation, runtime overhead 공간이 거의 남지 않음
5. 질문: KV cache가 batch size와 context length에 비례하는 이유는 무엇인가?
   - 답: 동시에 유지할 모든 request의 모든 cached token 상태가 필요하기 때문임
6. 질문: arithmetic intensity가 낮다는 뜻은 무엇인가?
   - 답: 가져온 data 양에 비해 수행하는 연산이 적다는 뜻임
7. 질문: hardware crossover point는 어떻게 구하는가?
   - 답: `peak FLOPS / memory bandwidth`로 근사함
8. 질문: 긴 prefill이 compute-bound가 될 수 있는 이유는 무엇인가?
   - 답: 많은 input token을 함께 처리해 matrix가 커지고 data 재사용과 병렬 연산이 증가하기 때문임
9. 질문: batch 1 decode가 memory bandwidth-bound인 이유는 무엇인가?
   - 답: token 하나를 만들 때 큰 weight를 읽지만 병렬 계산량은 작기 때문임
10. 질문: memory bandwidth-bound workload에 먼저 적용할 방향은 무엇인가?
    - 답: precision 축소, batching, cache 최적화, 불필요한 HBM data movement 제거임

## Chapter 5 이해 점검

1. 13B FP16 model weight의 근사 크기는?
2. KV cache를 계산할 때 Key와 Value 때문에 곱하는 값은?
3. GPU의 peak FLOPS가 100 TFLOPS, memory bandwidth가 1 TB/s이면 crossover point는?
4. workload arithmetic intensity가 40 FLOPS/B이면 3번 GPU에서 예상되는 병목은?
5. batch 1 decode에서 GPU utilization이 낮은 핵심 이유는?
6. 14 GB model을 16 GB GPU에 올렸을 때 가장 먼저 제한되는 두 항목은?
7. multi-GPU model shard에서 interconnect가 중요한 이유는?
8. latency SLO를 이미 만족한 뒤 우선 검토할 지표는?

### Chapter 5 정답

1. 약 26 GB
2. 2
3. 약 100 FLOPS/B
4. memory bandwidth-bound
5. weight data movement 대비 token 하나의 계산량이 작기 때문
6. KV cache와 activation
7. layer 또는 tensor shard 사이 data 교환이 inference critical path에 들어가기 때문
8. throughput과 request당 cost

## Chapter 6 스스로 이해하는 질문

1. 질문: dynamic batching이 LLM에서 충분하지 않은 이유는 무엇인가?
   - 답: request별 input·output length가 달라 짧은 request slot이 긴 request 완료까지 idle 상태가 되기 때문임
2. 질문: continuous batching에서 max delay가 필수가 아닌 이유는 무엇인가?
   - 답: fixed batch 출발을 기다리지 않고 iteration마다 빈 slot에 request를 추가하기 때문임
3. 질문: max_num_seqs와 max_num_batched_tokens를 함께 제한하는 이유는 무엇인가?
   - 답: request 수만으로는 token length 차이를 표현할 수 없기 때문임
4. 질문: chunked prefill이 개선하는 지표와 악화할 수 있는 지표는 무엇인가?
   - 답: throughput과 ITL 개선 가능, TTFT와 prefill overhead 악화 가능
5. 질문: GQA가 MHA보다 KV cache를 적게 쓰는 이유는 무엇인가?
   - 답: 여러 query head가 더 적은 수의 KV head를 공유하기 때문임
6. 질문: FlashAttention과 PagedAttention의 차이는 무엇인가?
   - 답: FlashAttention은 calculation 중 HBM I/O 감소, PagedAttention은 KV cache allocation fragmentation 감소가 목적임
7. 질문: W4A16이 low-batch decode에 유리한 이유는 무엇인가?
   - 답: weight가 작아져 memory bandwidth pressure가 크게 감소하기 때문임
8. 질문: W8A8이 high-batch prefill에 유리한 이유는 무엇인가?
   - 답: activation까지 낮은 precision으로 계산해 compute throughput을 높일 수 있기 때문임
9. 질문: prefix caching에서 prompt의 공백 하나가 중요한 이유는 무엇인가?
   - 답: token sequence가 달라져 해당 지점부터 prefix match가 끊길 수 있기 때문임
10. 질문: multi-tenant prefix cache에 tenant ID가 필요한 이유는 무엇인가?
    - 답: latency 차이를 이용한 다른 tenant의 prefix 존재 여부 추론을 막기 위함

## Chapter 6 이해 점검

1. variable-length request에서 dynamic batching의 idle을 줄이는 방식은?
2. chunked prefill이 너무 작을 때 발생하는 문제는?
3. 32 attention heads와 8 KV heads이면 어떤 attention이며 query 몇 개가 KV 하나를 공유하는가?
4. FlashAttention이 피하려는 memory는?
5. PagedAttention이 사용하는 OS 유사 개념은?
6. 7B FP16 weight를 INT8로 바꾸면 근사 크기는?
7. W4A16과 W8A8 중 high-batch prefill에 우선 검토할 방식은?
8. PTQ보다 QAT가 적합한 상황은?
9. prefix cache hit rate를 높이는 prompt 배치는?
10. prefix cache와 multi-tenant 환경의 핵심 보안 위험은?

### Chapter 6 정답

1. continuous batching
2. scheduler·kernel overhead 증가와 낮은 compute utilization
3. GQA, query 4개
4. HBM의 반복 read·write
5. fixed-size page와 page table mapping
6. 약 7 GB
7. W8A8
8. 4 bit 이하 aggressive quantization에서 accuracy 회복이 필요한 상황
9. static system·context를 앞에 두고 dynamic input을 뒤에 두는 배치
10. latency side channel을 통한 다른 tenant prefix 존재 추론
