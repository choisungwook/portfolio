# 시나리오 5. LLM 전용 벤치마크 도구(AIPerf, GuideLLM)로 측정하고 k6와 비교하기

이 문서는 과거 표준이었던 LLMPerf가 지원 중단(Archived)된 이후 현역 표준으로 자리 잡은 NVIDIA AIPerf와 GuideLLM으로 LiteLLM Proxy를 측정하고, 시나리오 3·4의 k6 결과와 무엇이 다른지 대조합니다.

## 이 시나리오의 목표

| 항목 | 내용 |
| --- | --- |
| 기능 | OpenAI 호환 LiteLLM Proxy를 대상으로 토크나이저 기반 ISL/OSL 고정 스트리밍 벤치마크 실행 |
| 쓰는 도구 | NVIDIA AIPerf (`v0.13.0`), GuideLLM (`v0.8.1`), [run-aiperf.sh](../benchmarks/run-aiperf.sh), [run-guidellm.sh](../benchmarks/run-guidellm.sh) |
| 입력 | 동시성 2, 요청 10건, 입력 128토큰(ISL) / 출력 64토큰(OSL) 고정 프로파일 |
| 작업 | 1. AIPerf 실행 및 CSV 리포트 확인 -> 2. GuideLLM 실행 및 콘솔 리포트 확인 -> 3. k6 결과와 비교 |
| 달성할 것 | 토크나이저 불일치·EOS 조기 종료 경고까지 자동 감지하며 P95 TTFT·ITL·TPS를 안정적으로 산출 |

## 이 기능이 무엇인가

LLM 전용 벤치마크 도구는 단순 HTTP 부하 생성기가 아니라, **모델 토크나이저로 입출력 토큰 길이를 통제하고 SSE 청크마다 타임스탬프를 기록해 LLM 핵심 지표(TTFT, ITL/TPOT, TPS, Goodput)를 자동 계산하는 도구**입니다.

관리형 API(AWS Bedrock, GCP Vertex AI)와 자체 서빙(vLLM, Ollama)을 같은 잣대로 비교하려면 앞단에 LiteLLM Proxy를 두어 OpenAI 호환 API(`/v1/chat/completions`)로 통일한 뒤 단일 도구로 측정하는 것이 표준입니다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
| --- | --- | --- |
| ISL (Input Sequence Length) | 요청 프롬프트의 입력 토큰 수 | `--isl 128` / `prompt_tokens=128` |
| OSL (Output Sequence Length) | 모델이 생성할 목표 출력 토큰 수 | `--osl 64` / `output_tokens=64` |
| Goodput (유효 처리율) | TTFT·TPOT SLO 기준을 모두 통과한 요청의 비율 | 실시간 서비스 합격선 95% 이상 |
| Sweep | 동시 접속자 수나 요청률을 자동으로 단계별 증가시켜 한계점을 찾는 기능 | GuideLLM `--profile kind=sweep` |
| `ignore_eos` | 모델이 EOS(종료) 토큰을 일찍 내도 목표 OSL까지 생성을 강제하는 서빙 옵션 | vLLM·TensorRT-LLM에서 OSL 고정 시 사용 |

## LLMPerf 대신 AIPerf·GuideLLM을 쓰는 이유

2026년 11월 기준 LLM 성능 벤치마크 생태계는 기존 **LLMPerf가 저장소 아카이브(Archived)로 지원 중단**되고, NVIDIA GenAI-Perf가 **AIPerf**로 세대교체되면서 아래 3강 체제로 재편되었습니다.

| 도구명 | 현재 상태 | 추천 적용 대상 | 특징 및 선정 이유 |
| --- | --- | --- | --- |
| NVIDIA AIPerf | 현역 표준 | vLLM, LiteLLM 프록시 (Bedrock/Vertex/Ollama) | GenAI-Perf의 공식 후속작으로, 멀티프로세스(ZMQ) 구조로 부하 생성기 병목을 제거하고 추론(Reasoning) 모델의 사고 토큰까지 분리 측정(TTFT vs TTFO)함 |
| GuideLLM | 현역 표준 | vLLM, OpenAI 호환 엔드포인트 | vLLM 프로젝트에서 관리하며, 동시성을 자동 단계별 증가(Sweep)시켜 한계점을 찾고 HTML/JSON/CSV 보고서를 자동 생성해 LLMPerf의 실질적 대체재로 쓰임 |
| vLLM Bench (`vllm bench serve`) | 현역 표준 | 자체 서빙 vLLM | 별도 설치 없이 즉시 실행 가능하며 Goodput 측정과 서버 튜닝 전후 빠른 비교에 최적화됨 |
| LLMPerf | 지원 중단 | 신규 도입 비권장 | 과거 널리 쓰였으나 저장소가 아카이브되어 신규 환경에서는 AIPerf 또는 GuideLLM 사용 권장 |

## 컴포넌트 역할

| 컴포넌트 | 역할 |
| --- | --- |
| NVIDIA AIPerf (`uvx --from aiperf`) | 멀티프로세스 워커로 워밍업 제외, ISL/OSL 고정, CSV/JSON 아티팩트 자동 저장 |
| GuideLLM (`uvx --from guidellm`) | HuggingFace 토크나이저로 정확한 토큰 길이 생성, 동시성·Sweep 기반 요약 표 출력 |
| LiteLLM Proxy (`localhost:4000`) | OpenAI 호환 엔드포인트 제공 및 인증(`sk-local-litellm-test`) 처리 |
| Ollama (`qwen2.5:1.5b`) | 로컬 모델 추론 실행 |

## 흐름

아래 다이어그램은 전용 벤치마크 도구가 요청 생성부터 결과 판정까지 어떤 파이프라인을 거치는지 보여줍니다.

```mermaid
flowchart LR
  Tok["토크나이저<br/>(builtin / Qwen2.5)"] -->|"ISL 128 고유 프롬프트 생성"| Warm["워밍업 요청 제외"]
  Warm -->|"동시성 2 / SSE 스트리밍"| LiteLLM["LiteLLM Proxy"]
  LiteLLM --> Ollama["Ollama (qwen2.5:1.5b)"]
  Ollama -->|"청크별 타임스탬프 + usage"| Eval["지표 집계 및 진단<br/>TTFT · ITL · TPS · OSL 경고"]
```

## NVIDIA AIPerf 예제

고동시성 부하에서 클라이언트(부하 생성기) 병목을 없애야 하거나, JSON/CSV 원시 아티팩트를 CI/CD 파이프라인에 자동 저장해야 할 때 AIPerf를 선택합니다.

### 1. AIPerf 실행

[run-aiperf.sh](../benchmarks/run-aiperf.sh)는 오프라인 `builtin` 토크나이저(tiktoken)를 사용해 HuggingFace 다운로드 없이 워밍업 2건, 본 측정 10건을 실행합니다.

```bash
cd computer_science/ai/litellm-sse-load-test
./benchmarks/run-aiperf.sh
```

실행이 끝나면 `benchmarks/output/aiperf/profile_export_aiperf.csv`와 `.json`이 자동 저장됩니다. 핵심 지표 실측 결과는 다음과 같습니다.

| 지표 | Avg | P50 | P95 | P99 |
| --- | --- | --- | --- | --- |
| Time to First Token (TTFT) | `1183.3 ms` | `1271.5 ms` | `1355.2 ms` | `1388.8 ms` |
| Inter Token Latency (ITL) | `17.5 ms` | `17.7 ms` | `18.2 ms` | `18.5 ms` |
| Request Latency (E2E) | `2251.6 ms` | `2347.8 ms` | `2424.1 ms` | `2452.3 ms` |
| Output Token Throughput | `51.54 tokens/sec` (요청 처리량 `0.83 req/s`, 에러율 `0.00%`) | - | - | - |

실행 도중 AIPerf가 출력하는 두 가지 경고는 실무에서 매우 유용합니다.

- **Usage Discrepancy 경고**: 클라이언트 `--tokenizer builtin`(tiktoken)과 서버(`qwen2.5:1.5b`)의 프롬프트 토큰 계산 차이를 `23.67%`로 감지해 알립니다. 정확한 모델 토크나이저를 쓰려면 `--tokenizer Qwen/Qwen2.5-1.5B-Instruct`로 바꾸거나 `--use-server-token-count`를 지정합니다.
- **OSL Mismatch 경고**: 10건 중 1건이 목표 64토큰 전에 EOS 토큰을 만나 조기 종료되었음을 감지하고, vLLM 등에서는 `--extra-inputs ignore_eos:true`를 쓰라고 안내합니다.

## GuideLLM 예제

동시성을 단계별로 올려가며 SLO 한계점을 자동으로 찾고(Sweep), 사업팀과 공유할 깔끔한 리포트를 빠르게 뽑아야 할 때 GuideLLM을 선택합니다.

### 1. GuideLLM 실행

[run-guidellm.sh](../benchmarks/run-guidellm.sh)는 LiteLLM의 모델 별칭(`local-qwen`)과 별도로 실제 HuggingFace 토크나이저(`Qwen/Qwen2.5-1.5B-Instruct`)를 명시해 실행합니다.

```bash
cd computer_science/ai/litellm-sse-load-test
./benchmarks/run-guidellm.sh
```

콘솔 요약 표에서 실제 Qwen 토크나이저 기준의 TTFT, ITL, TPOT, 토큰 처리량이 한 번에 출력됩니다.

```text
ℹ Request Latency Statistics (Completed Requests)
| Benchmark    | Request Latency (Sec)  | TTFT (ms)              | ITL (ms)        | TPOT (ms)       |
| Strategy     | Mean      | Mdn | p95  | Mean     | Mdn  | p95  | Mean | Mdn | p95| Mean | Mdn | p95|
| concurrent@2 | 1.8 ± 0.4 | 1.8 | 2.3* | 936.9    | 1203 | 1231 | 16.2 | 16.4|16.5| 34.4 | 34.9|52.3|

ℹ Server Throughput Statistics (All Requests)
| Strategy     | Concurrency (Mean) | Requests/sec | Input Tokens/sec | Output Tokens/sec | Total Tokens/sec |
| concurrent@2 | 1.9                | 1.0          | 163.7            | 52.9              | 216.6            |
```

> [!TIP]
> 동시성 한계점을 자동으로 탐색하려면 `--profile kind=concurrent,streams=2` 대신 `--profile kind=sweep`으로 바꾸고 `--output kind=html,path=benchmarks/output/guidellm.html`을 추가해 그래프 리포트를 생성합니다.

## k6 · xk6-sse · AIPerf · GuideLLM 실측 비교

지금까지 같은 로컬 LiteLLM + Ollama(`qwen2.5:1.5b`) 환경에서 네 가지 방식으로 측정한 결과를 한 표로 비교합니다.

![k6, xk6-sse, AIPerf, GuideLLM 실측 비교 차트](../imgs/benchmark-tools-comparison.png)

| 도구 | 부하 조건 | TTFT (P95) | ITL / TPOT (P95) | E2E (P95) | Output TPS | 토큰 길이 통제 |
| --- | --- | --- | --- | --- | --- | --- |
| 기본 `k6/http` | 2 VU 폐쇄 루프, 6건 | 측정 불가 (TTFB만 존재) | 측정 불가 | `3.90s` | 측정 불가 | 불가 |
| `xk6-sse` | 개방 루프 `0.5/s`, 7건 | `234.9 ms` | `17.9 ms` (청크 기준) | `1.92s` | `48.7 chunks/s` | 불가 |
| NVIDIA AIPerf | 동시성 2, 10건 (워밍업 2건 제외) | `1355.2 ms` | `18.2 ms` | `2.42s` | `51.5 tokens/s` | ISL 128 / OSL 64 + 경고 |
| GuideLLM | 동시성 2, 10건 | `1230.7 ms` | `16.5 ms` (ITL) | `2.30s` | `52.9 tokens/s` | ISL 128 / OSL 64 (Qwen 토크나이저) |

`xk6-sse`의 TTFT(`234.9 ms`)보다 AIPerf(`1355.2 ms`)와 GuideLLM(`1230.7 ms`)의 TTFT가 높게 나온 이유는 명확합니다. `xk6-sse`는 2초에 1건씩 보내 동시 요청이 거의 겹치지 않았고, AIPerf와 GuideLLM은 동시성 2를 유지하며 128토큰 프롬프트가 연달아 들어와 Ollama의 Prefill 대기열이 생겼기 때문입니다. **같은 모델이라도 동시성과 입력 토큰 길이에 따라 TTFT가 5배 이상 달라지므로, 항상 조건을 고정하고 메타데이터와 함께 기록해야 합니다.**

## 부록. 실무 결과 판정 및 액션 가이드

벤치마크에서 시나리오 1의 SLO 기준을 초과(Fail)했을 때 인프라 유형에 따라 취할 조치입니다.

| 테스트 결과 증상 | Bedrock / Vertex (관리형 API) 조치 | 자체 서빙 vLLM 조치 |
| --- | --- | --- |
| 429 에러 발생 / RPS 정체 | RPM·TPM 쿼터 증설 요청, 일정 트래픽이면 Provisioned Throughput(PT) 검토 | 타임아웃·OOM 로그 확인 |
| TTFT만 1초 이상 급증 | Cross-Region Inference 활성화, Prompt Caching 적용 | `max-num-batched-tokens` 조정, Prefix Caching·Chunked Prefill 튜닝 |
| TPOT가 50ms 초과로 저하 | 더 가벼운 모델(Flash/Haiku/Mini 계열)로 라우팅 분리 | Concurrency Cap 설정, FP8/AWQ 양자화, GPU 증설 |
| Goodput 95% 미만 도달 | 직전 통과 구간의 RPS를 현재 쿼터의 정격 용량으로 확정하고 증설 규모 산정 | 직전 통과 구간의 RPS를 서버 1대 정격 용량으로 확정하고 HPA 기준치로 설정 |

지속적인 부하테스트를 운영할 때는 세 가지 원칙을 고정합니다.

1. **워밍업 구간 제외**: 본 측정 전 최소 10~20건(로컬 실습은 2건)의 워밍업 요청을 먼저 흘려보냅니다.
2. **단일 변수 변경 원칙**: 서버 파라미터나 쿼터를 조정할 때 한 번에 한 가지 변수만 바꾸고 재측정합니다.
3. **메타데이터 자동 기록**: 모델 버전, 양자화 방식, 하드웨어 스펙, ISL/OSL 설정을 JSON/CSV 결과 파일과 함께 보관합니다.

## 참고 문서

1. [NVIDIA AIPerf 공식 문서](https://github.com/ai-dynamo/aiperf)
2. [vLLM GuideLLM 공식 문서](https://github.com/vllm-project/guidellm)
3. [Ray Project LLMPerf (Archived)](https://github.com/ray-project/llmperf)
