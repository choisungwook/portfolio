# Chapter 5 LLM serving challenge

- PDF 범위: 163페이지 시작
- 다음 장 시작: 198페이지

## 학습 여부

- 학습 필요
- 단순 Kubernetes 용어 정리 아님
- Chapter 6 optimization을 이유부터 이해하기 위한 hardware 기초임

## 목표

- LLM serving optimization의 business 가치 판단
- GPU spec을 model workload 관점에서 해석
- model weight, KV cache, activation의 GPU memory 요구량 추정
- prefill과 decode의 병목을 arithmetic intensity로 구분
- compute-bound와 memory bandwidth-bound에 맞는 optimization 방향 선택

## 목차

1. LLM serving optimization의 필요성
2. GPU spec과 accelerator 선택
3. model loading과 GPU memory budget
4. arithmetic intensity와 roofline model
5. prefill·decode 병목과 memory wall

## 주제별 핵심 주장

### 1. LLM serving optimization의 필요성

- optimization은 customer experience, cost, scalability를 동시에 좌우함
- 충분히 빠른 latency 이후에는 throughput과 cost 최적화가 더 큰 가치임

### 2. GPU spec과 accelerator 선택

- GPU 선택 기준은 FLOPS 하나가 아니라 memory capacity, memory bandwidth, interconnect, power의 조합임
- workload가 사용하지 못하는 peak FLOPS는 운영 가치가 없음

### 3. model loading과 GPU memory budget

- GPU memory에는 model weight뿐 아니라 KV cache와 activation 공간도 필요함
- model이 겨우 적재되는 GPU보다 batch와 context를 감당할 여유가 있는 GPU가 필요함

### 4. arithmetic intensity와 roofline model

- arithmetic intensity는 연산량을 data movement로 나눈 값임
- hardware crossover point보다 낮으면 memory bandwidth-bound, 높으면 compute-bound임

### 5. prefill·decode 병목과 memory wall

- 긴 prefill은 compute-bound가 될 수 있으나 batch 1의 decode는 대체로 memory bandwidth-bound임
- compute 발전보다 data movement 발전이 느린 memory wall이 LLM serving의 핵심 제약임

## 읽기 전 용어

### 1. LLM serving optimization의 필요성

- `latency`: 요청부터 응답까지 걸린 시간
- `TTFT`: 첫 token이 나오기까지 걸린 시간
- `throughput`: 단위 시간당 처리량
- `SLO`: 서비스가 달성해야 할 성능 목표

### 2. GPU spec과 accelerator 선택

- `FLOPS`: 초당 floating-point operation 수
- `VRAM`: GPU가 model과 실행 상태를 보관하는 memory
- `memory bandwidth`: VRAM과 compute unit 사이의 초당 data movement 양
- `interconnect`: GPU 사이 data 이동 경로
- `NVLink`, `PCIe`, `RDMA`: 서로 다른 범위와 성능의 interconnect 기술
- `TDP`: 지속 부하에서 고려할 전력 한도

### 3. model loading과 GPU memory budget

- `parameter`: model이 학습한 weight 값
- `precision`: parameter 하나를 표현하는 bit 수
- `KV cache`: 이전 token의 Key·Value를 재사용하기 위한 실행 상태
- `activation`: layer 중간 계산에서 생성되는 tensor
- `OOM`: 필요한 memory가 가용 memory를 넘은 상태

### 4. arithmetic intensity와 roofline model

- `arithmetic intensity`: FLOPS/Byte
- `roofline model`: compute와 memory bandwidth가 만드는 성능 상한 모델
- `crossover point`: 두 상한이 만나는 arithmetic intensity
- `HBM`: 큰 model data를 담는 off-chip GPU memory
- `SRAM`: compute unit 가까이 위치한 작고 빠른 on-chip memory

### 5. prefill·decode 병목과 memory wall

- `prefill`: input token 전체를 병렬 처리하고 최초 KV cache를 만드는 단계
- `decode`: token을 autoregressive 방식으로 하나씩 생성하는 단계
- `compute-bound`: compute capability가 성능 상한인 상태
- `memory bandwidth-bound`: data movement가 성능 상한인 상태
- `memory wall`: compute 증가 속도를 memory와 interconnect가 따라가지 못하는 현상

## 주제별 선행지식

### 1. LLM serving optimization의 필요성

- request, latency, throughput의 기본 의미
- horizontal scaling과 peak traffic 개념
- GPU instance 비용이 request 증가에 따라 누적되는 구조

### 2. GPU spec과 accelerator 선택

- byte, GB, GB/s 단위
- single node와 multi-node 구분
- PCIe 장치와 network 기본 구조

### 3. model loading과 GPU memory budget

- FP32 4 byte, FP16·BF16 2 byte, INT8·FP8 1 byte
- Transformer의 layer, attention head, hidden dimension
- batch size와 sequence length

### 4. arithmetic intensity와 roofline model

- matrix multiplication의 입력·weight·출력 shape
- multiplication과 addition을 FLOPS로 세는 방법
- 비율과 단위 변환

### 5. prefill·decode 병목과 memory wall

- Transformer inference의 prefill·decode 분리
- HBM → SRAM → register data movement
- autoregressive generation

## 스스로 이해하는 질문 10개

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

## 상세 설명

### 1. LLM serving optimization의 필요성

- customer experience
  - chatbot의 핵심 체감 지표: TTFT
  - agent workflow의 핵심 지표: 여러 model call이 누적된 E2E latency
  - 20초를 1초로 줄이는 변화와 0.1초를 0.01초로 줄이는 변화의 가치 차이 존재
- cost efficiency
  - training: 주로 선투자 성격
  - inference: 모든 production request마다 반복되는 비용
  - 같은 hardware에서 throughput 증가 시 request당 cost 감소
- scalability와 feasibility
  - peak traffic에서 GPU 공급과 scale-out 속도가 제한 요소
  - 작은 GPU 또는 여러 region에서 실행 가능할수록 배포 선택지 증가
- 판단 순서
  1. workload와 SLO 정의
  2. quality를 만족하는 model 선정
  3. latency 목표 충족 여부 확인
  4. throughput과 cost 개선

### 2. GPU spec과 accelerator 선택

- compute capability
  - precision별 FLOPS 확인 필요
  - FP16, FP8, INT8 지원 여부에 따라 실제 사용 가능한 peak 값 변화
- memory capacity
  - model weight, KV cache, activation 적재 가능 여부 결정
  - capacity 부족 시 실행 자체가 불가능하거나 multi-GPU 필요
- memory bandwidth
  - decode처럼 weight를 반복해서 읽는 workload의 핵심 한계
  - 높은 FLOPS라도 data 공급이 느리면 compute unit idle 발생
- interconnect
  - independent model을 GPU별로 실행하면 PCIe로 충분할 수 있음
  - 하나의 model을 shard하면 NVLink·NVSwitch·RDMA 중요도 증가
  - inter-node bandwidth는 보통 intra-node보다 낮아 latency 위험 증가
- power
  - rack 전력과 cooling 한도가 배치 가능한 GPU 수를 제한함
  - chip 가격 외에 facility 제약까지 포함한 판단 필요

### 3. model loading과 GPU memory budget

- model weight 근사식

```text
model weight bytes = parameter count × bytes per parameter
```

- MHA 기준 KV cache 근사식

```text
KV bytes/token = 2 × layers × KV heads × head dimension × bytes per element
total KV bytes = KV bytes/token × batch size × sequence length
```

- `2`의 의미: Key와 Value 두 tensor
- Llama 2 7B 예시
  - 32 layers, 32 KV heads, head dimension 128, BF16 2 byte
  - token당 약 0.5 MB
  - batch 16, sequence 4096이면 KV cache 약 32 GB
- 실제 budget
  - `weight + KV cache + activation + runtime overhead + safety margin`
  - 이론상 최대 batch보다 낮게 운영하는 이유임
  - 시작점 경험칙: model size의 약 2배 GPU memory 검토
- DevOps 관점
  - Pod `nvidia.com/gpu: 1`만으로 capacity 보장 불가
  - model config, max sequence, concurrency가 함께 배포 단위가 되어야 함

### 4. arithmetic intensity와 roofline model

- 기본식

```text
arithmetic intensity = number of FLOPS / moved bytes
crossover point = peak FLOPS / memory bandwidth
```

- FP16 matrix multiplication 근사

```text
operations = 2 × M × N × K
moved bytes = 2 × (M × K + K × N + M × N)
intensity = M × N × K / (M × K + K × N + M × N)
```

- 판정
  - workload intensity < crossover point: memory bandwidth-bound
  - workload intensity >= crossover point: compute-bound
- 해석 한계
  - peak spec과 이상적인 data reuse를 사용한 상한 모델임
  - kernel overhead, cache hit, scheduler, thermal 상태는 별도 측정 필요

### 5. prefill·decode 병목과 memory wall

- prefill
  - input shape의 sequence dimension이 큼
  - input token 병렬 처리 가능
  - 짧은 prompt에서는 memory bandwidth-bound 가능
  - 긴 prompt에서는 compute-bound 전환 가능
- decode
  - iteration마다 새 token 하나 생성
  - batch 1에서 matrix의 token dimension이 1임
  - 큰 weight 이동 대비 계산량이 작아 memory bandwidth-bound 경향
- optimization 연결
  - compute-bound: 낮은 precision compute, kernel, FLOPS 감소 방향
  - memory bandwidth-bound: quantization, batching, KV cache 축소, kernel fusion 방향
- memory wall
  - compute FLOPS 발전 속도보다 HBM과 interconnect 발전 속도가 느린 상태
  - on-chip SRAM 활용과 tightly coupled multi-GPU system이 대응 방향

## 이해 점검 퀴즈

1. 13B FP16 model weight의 근사 크기는?
2. KV cache를 계산할 때 Key와 Value 때문에 곱하는 값은?
3. GPU의 peak FLOPS가 100 TFLOPS, memory bandwidth가 1 TB/s이면 crossover point는?
4. workload arithmetic intensity가 40 FLOPS/B이면 3번 GPU에서 예상되는 병목은?
5. batch 1 decode에서 GPU utilization이 낮은 핵심 이유는?
6. 14 GB model을 16 GB GPU에 올렸을 때 가장 먼저 제한되는 두 항목은?
7. multi-GPU model shard에서 interconnect가 중요한 이유는?
8. latency SLO를 이미 만족한 뒤 우선 검토할 지표는?

### 정답

1. 약 26 GB
2. 2
3. 약 100 FLOPS/B
4. memory bandwidth-bound
5. weight data movement 대비 token 하나의 계산량이 작기 때문
6. KV cache와 activation
7. layer 또는 tensor shard 사이 data 교환이 inference critical path에 들어가기 때문
8. throughput과 request당 cost

## 다음 날 2분 복습

- model weight: `parameter × bytes`
- KV cache: `2 × layers × KV heads × head dimension × bytes × tokens`
- GPU 선택: FLOPS + memory capacity + memory bandwidth + interconnect + power
- roofline crossover: `peak FLOPS / memory bandwidth`
- prefill: 긴 sequence에서 compute-bound 가능
- decode: batch 1에서 memory bandwidth-bound 경향
- compute-bound 대응: compute 축소와 efficient kernel
- memory bandwidth-bound 대응: data movement 축소와 batching
- 결론: optimization technique보다 먼저 workload 병목 확인 필요
