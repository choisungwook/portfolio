# Chapter 6 Essential LLM optimization

- PDF 범위: 198페이지 시작
- 예제 연결: `llm-model-inference/ch06/quantization_3way_300.ipynb`

## 학습 여부

- 학습 필요
- 단순 Kubernetes 용어 정리 아님
- Chapter 5에서 찾은 compute·memory 병목에 실제 technique을 연결하는 장임

## 목표

- dynamic batching, continuous batching, chunked prefill의 차이 판단
- MHA, MQA, GQA, MLA와 KV cache 크기의 관계 이해
- kernel fusion, FlashAttention, PagedAttention의 해결 대상 구분
- quantization, distillation, pruning의 trade-off 판단
- prefix caching의 hit rate, scaling, tenant isolation 설계

## 핵심 성능 지표

| 지표 | 정의 | 주요 영향 |
| --- | --- | --- |
| TTFT | request부터 첫 token까지의 시간 | queue와 prefill |
| TPOT | 첫 token 이후 output token당 평균 시간 | decode |
| E2E latency | request부터 마지막 token까지의 시간 | 전체 경로 |
| RPS | 초당 완료 request 수 | request throughput |
| Output TPS | 초당 생성 output token 수 | decode throughput |
| Accuracy | 정답 비율 | quality |

- `TTOP`: 일반적인 serving 지표 명칭 아님
- `TPOT`: time per output token
- `ITL`: inter-token latency

## 목차

1. Request batching과 scheduling
2. Attention과 KV cache optimization
3. Model compression
4. Prefix caching

## 주제별 핵심 주장

### 1. Request batching과 scheduling

- continuous batching은 완료된 request 자리를 즉시 재사용해 variable-length request의 GPU idle을 줄임
- chunked prefill은 throughput·ITL을 개선할 수 있지만 TTFT와 prefill overhead를 늘릴 수 있음

### 2. Attention과 KV cache optimization

- MQA·GQA·MLA는 KV cache 자체를 줄이고, FlashAttention은 attention I/O를 줄이며, PagedAttention은 allocation waste를 줄임
- 같은 attention optimization이라는 이름 아래 서로 다른 병목을 해결함

### 3. Model compression

- quantization은 가장 적용하기 쉬운 production compression이며 memory, data movement, compute를 줄일 수 있음
- precision과 방식은 accuracy, hardware support, prefill·decode workload를 함께 보고 선택해야 함

### 4. Prefix caching

- prefix caching은 반복 prompt의 KV cache를 재사용해 prefill과 TTFT를 줄임
- 실제 hit rate는 prompt ordering·format, cache-aware routing, tenant isolation에 좌우됨

## 읽기 전 용어

### 1. Request batching과 scheduling

- `static batching`: 정해진 batch가 찰 때까지 대기하는 방식
- `dynamic batching`: max batch size 또는 max delay 조건으로 batch를 내보내는 방식
- `continuous batching`: iteration 중 빈 slot에 새 request를 투입하는 방식
- `max_num_seqs`: 동시에 처리할 request 수의 상한
- `max_num_batched_tokens`: 한 iteration에서 처리할 token 수의 상한
- `chunked prefill`: 긴 prefill을 작은 token chunk로 분리하는 방식

### 2. Attention과 KV cache optimization

- `MHA`: query head마다 독립 Key·Value head를 갖는 구조
- `MQA`: 모든 query head가 하나의 Key·Value head를 공유하는 구조
- `GQA`: query head group마다 Key·Value head를 공유하는 구조
- `MLA`: Key·Value를 latent representation으로 압축하는 구조
- `kernel fusion`: 여러 GPU operation을 하나의 kernel로 결합하는 기법
- `FlashAttention`: tiling과 online softmax로 HBM I/O를 줄이는 attention kernel
- `PagedAttention`: KV cache를 fixed-size block으로 관리하는 방식

### 3. Model compression

- `quantization`: parameter precision을 낮추는 기법
- `rounding error`: 표현 가능한 가까운 값으로 바뀌며 생기는 오차
- `clamping error`: 표현 범위 밖 값을 경계값으로 자르며 생기는 오차
- `W4A16`: weight 4 bit, activation 16 bit
- `W8A8`: weight 8 bit, activation 8 bit
- `PTQ`: training 완료 후 적용하는 quantization
- `QAT`: training 중 quantization effect를 반영하는 방식
- `distillation`: teacher model 지식을 작은 student model에 전달하는 방식
- `pruning`: 불필요한 weight 또는 구조를 제거하는 방식

### 4. Prefix caching

- `prefix`: prompt 앞부분의 동일한 token sequence
- `RadixAttention`: radix tree로 prefix와 KV cache를 연결하는 방식
- `LRU`: 오래 사용하지 않은 cache부터 제거하는 정책
- `cache-aware routing`: prefix가 있는 replica로 request를 보내는 routing
- `tenant isolation`: tenant 사이 cache 정보 노출을 차단하는 경계

## 주제별 선행지식

### 1. Request batching과 scheduling

- queue와 scheduler
- prefill, decode, TTFT, ITL, throughput
- batch size와 sequence length

### 2. Attention과 KV cache optimization

- Query, Key, Value의 역할
- GPU HBM, SRAM, register 계층
- memory fragmentation과 OS paging

### 3. Model compression

- bit, byte, signed integer, floating-point
- weight, activation, KV cache
- calibration dataset과 accuracy benchmark

### 4. Prefix caching

- hash cache와 prefix tree
- load balancing과 horizontal scaling
- multi-tenant threat boundary

## 스스로 이해하는 질문 10개

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

## 상세 설명

### 1. Request batching과 scheduling

- batching 효과
  - model weight를 한 번 읽고 여러 request token을 계산
  - decode arithmetic intensity와 throughput 증가
  - batch 증가만큼 latency와 KV cache도 증가 가능
- dynamic batching
  - dispatch 조건: max batch size 도달 또는 max delay 만료
  - traditional ML workload에 적합
  - variable-length LLM request에서는 longest request가 batch 완료를 지배
- continuous batching
  - iteration-level scheduling
  - 완료 slot에 queued request 즉시 투입
  - `max_num_seqs`: request-level safety bound
  - `max_num_batched_tokens`: token-level compute·memory bound
- chunked prefill
  - long prefill을 작은 chunk로 분할
  - running decode와 interleave 가능
  - 작은 chunk: overhead와 낮은 compute utilization 위험
  - 큰 chunk: decode blocking과 높은 ITL 위험
- 선택 기준
  - offline batch: static batching 가능
  - online variable length: continuous batching 기본
  - long-context interactive: chunked prefill 검토

### 2. Attention과 KV cache optimization

- architecture 수준
  - MHA: `KV heads = attention heads`
  - MQA: `KV heads = 1`
  - GQA: `1 < KV heads < attention heads`
  - MLA: compressed latent KV 사용
  - KV head 감소 시 capacity와 HBM data movement 감소
- kernel 수준
  - kernel fusion: 중간 결과의 HBM write/read round trip 제거
  - FlashAttention: QKV matrix를 tile로 나누어 SRAM에서 계산
  - online softmax로 전체 attention matrix materialization 회피
- memory management 수준
  - contiguous preallocation: variable length에서 internal·external fragmentation 발생
  - PagedAttention: logical block을 scattered physical block에 mapping
  - 마지막 block 외 waste를 작게 제한
- 구분
  - MQA·GQA·MLA: model architecture 선택
  - FlashAttention: compute kernel 선택
  - PagedAttention: serving runtime memory manager 선택

### 3. Model compression

- quantization 효과
  - model file과 VRAM footprint 감소
  - HBM data movement 감소
  - hardware가 낮은 precision을 native 지원하면 compute 증가
- error
  - rounding error: 값 간격 부족
  - clamping error: 값 범위 부족
  - scaling: original range를 target range에 맞추는 핵심
- FP16과 BF16
  - FP16: exponent 5 bit, mantissa 10 bit
  - BF16: exponent 8 bit, mantissa 7 bit
  - BF16: FP32와 같은 exponent 폭으로 넓은 dynamic range
- W4A16
  - weight-only quantization
  - model size 약 75% 감소
  - low-batch decode와 memory 제약에 유리
  - dequantization 또는 mixed-precision kernel 필요
- W8A8
  - weight-and-activation quantization
  - model size 약 50% 감소
  - high-batch·long prefill의 compute-bound workload에 유리
  - static scaling은 빠르지만 calibration 필요
  - dynamic scaling은 정확하지만 runtime overhead 존재
- PTQ와 QAT
  - PTQ: 쉬운 적용, hardware 전환 유연성, 보통 첫 선택
  - QAT: 낮은 bit accuracy에 유리, training pipeline과 비용 필요
- distillation
  - 이미 검증된 student model이 있으면 높은 serving 이점
  - 직접 수행 시 teacher 접근, dataset, training 비용 필요
- pruning
  - structured pruning: hardware가 활용 가능한 구조 제거
  - unstructured pruning: 유연하지만 sparse kernel 지원 없으면 speedup 제한
  - 2:4 sparsity: hardware 지원과 함께 사용해야 실제 이점
- production 판단 순서
  1. quality acceptance test 정의
  2. PTQ variant 평가
  3. workload별 latency·throughput 측정
  4. model·GPU native format 확인
  5. quality와 SLO를 모두 만족한 variant 선택

### 4. Prefix caching

- response cache와 차이
  - response cache: 전체 input 일치 필요
  - prefix cache: 앞부분 token의 KV cache만 재사용
- 적합 workload
  - multiturn chat: 이전 대화가 다음 request의 prefix가 됨
  - long-context: 고정 document와 system prompt가 반복됨
  - RAG: document ordering과 formatting이 안정적일 때 부분 hit 가능
- hit rate 개선
  - static content를 앞쪽에 배치
  - dynamic user input을 뒤쪽에 배치
  - whitespace, label, document order 고정
  - retrieval deduplication과 stable ranking 적용
- scale-out
  - local GPU cache만 있을 때 round robin은 hit rate 손실 가능
  - cache-aware routing 또는 consistent hashing 필요
  - CPU·SSD offload는 capacity를 늘리지만 latency 계층 추가
- security
  - shared prefix hit latency가 side channel이 될 수 있음
  - tenant ID 또는 session ID를 shared system prompt 뒤에 삽입
  - tenant별 prefix namespace 분리 필요

## 이해 점검 퀴즈

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

### 정답

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

## 다음 날 2분 복습

- online LLM 기본 scheduler: continuous batching
- long prefill: chunking으로 decode와 interleave, TTFT trade-off 존재
- MHA → GQA → MQA: KV head 감소, memory 감소, quality trade-off 증가
- FlashAttention: HBM I/O 감소
- PagedAttention: KV cache fragmentation 감소
- W4A16: low-batch decode와 memory 제약
- W8A8: high-batch prefill과 compute throughput
- PTQ: 먼저 시도할 쉬운 quantization
- prefix caching: static prefix 고정과 cache-aware routing
- multi-tenant cache: tenant namespace 분리 필수
