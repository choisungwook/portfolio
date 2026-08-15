# Chapter 3 핵심 내용

## 학습 목표

- 특정 프레임워크 사용법보다 LLM 서빙 시스템의 구성 원리 이해
- single-model 서빙에 batching과 streaming 추가
- multi-model 서빙에 model cache, routing, isolation 추가
- 직접 구현한 구성 요소를 vLLM과 Triton으로 치환
- 비용 최적화와 지연 시간 최적화 설계의 trade-off 비교

## Single-model 서빙의 핵심 구성 요소

1. API server
   - 요청 검증과 응답 처리
2. LLM engine
   - 요청의 전체 실행 흐름 조정
3. Workload manager
   - sequence 상태와 batch 구성 관리
4. Model executor
   - model worker와 IPC 수행
5. Model worker
   - 모델 로드와 실제 추론 수행
6. Model manager
   - 모델 메타데이터와 생명주기 관리

웹 처리와 모델 실행을 분리하면 CPU 작업이 accelerator 실행 흐름을 막는 시간을 줄일 수 있다. 요청은 sequence ID로 추적해야 여러 사용자의 prompt를 한 batch에 섞은 뒤 결과를 원래 요청으로 되돌릴 수 있다.

## Batching

- 여러 prompt를 한 번의 model 실행으로 처리
- accelerator 병렬성을 이용해 throughput 향상
- batch를 채우는 대기와 padding 때문에 개별 latency 증가 가능
- batch size 증가가 항상 선형 speedup을 만들지는 않음
- 하드웨어 포화점 이후에는 메모리와 latency 비용만 증가 가능

## Streaming과 continuous batching

- 전체 문장 생성 완료 전 토큰 단위 응답 제공
- TTFT(Time To First Token) 감소
- 완료된 sequence를 batch에서 제거
- 대기 중인 sequence를 빈 자리에 합류
- background thread와 asyncio event loop 사이의 안전한 전달 경로 필요

교육용 구현은 `use_cache=False`로 매 토큰마다 전체 prompt를 다시 계산한다. 실제 프레임워크는 KV cache를 관리해 이전 토큰 계산을 재사용한다.

## vLLM이 추상화하는 부분

- continuous batching
- sequence scheduling
- KV cache 관리
- PagedAttention 기반 메모리 관리
- OpenAI 호환 server API

`max_num_seqs`는 동시 처리 sequence 상한이다. 직접 구현의 batch size와 대응하므로 workload와 메모리에 맞춰 조정해야 한다.

## Multi-model 서빙

- Model store: model metadata 조회
- Model manager: cache와 load/unload 정책 관리
- Model engine: framework별 worker 생성
- Model worker: 실제 추론 또는 외부 model server 호출
- API server: 통합 prediction API 제공

LRU cache 크기가 활성 model 수보다 작고 요청이 균등하면 model이 반복 축출된다. cache miss마다 cold start가 발생하는 thrashing 상태가 된다. 트래픽이 일부 model에 집중되면 작은 cache도 높은 hit rate를 만들 수 있다.

## Triton으로 치환되는 부분

- 모델 load/unload API
- framework별 inference backend
- inference protocol과 tensor contract
- accelerator 실행과 메모리 관리

자체 서비스에는 metadata, routing, cache 정책을 남기고 실제 추론은 Triton에 위임할 수 있다.

## Cost와 latency trade-off

| 설계 | model 배치 | 장점 | 대가 |
| --- | --- | --- | --- |
| Cost-optimized | 여러 model이 worker pool 공유 | 높은 자원 활용률 | cache miss와 cold start |
| Latency-optimized | model별 전용 worker 사전 배치 | 예측 가능한 낮은 latency | 유휴 자원과 배포 수 증가 |

- Cost router는 backend 상태를 관측한 뒤 warm model 위치를 학습하는 reactive 방식
- Latency router는 사전에 정한 model-to-backend map 사용
- 평균보다 p95와 max에서 cold start 차이가 선명함
- model 수, 동시 활성 model 수, 트래픽 국소성, cold start 허용치로 설계 선택

## 실습 연결

| 주제 | 실습 |
| --- | --- |
| process 격리와 IPC | [02_basic](../02_basic/README.md) |
| sequence와 FIFO batching | [03_batching](../03_batching/README.md) |
| SSE와 continuous batching | [04_streaming](../04_streaming/README.md) |
| vLLM 추상화 | [05_vllm](../05_vllm/README.md) |
| LRU model cache와 Triton | [06_multimodel](../06_multimodel/README.md) |
| cost와 latency 설계 비교 | [07_tradeoff](../07_tradeoff/README.md) |
