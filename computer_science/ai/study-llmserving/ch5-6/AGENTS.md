# LLM serving Chapter 5·6 — agent memory

이 파일은 이 workspace를 수정하는 agent를 위한 영구 맥락이다. 저장소 공통 규칙은 루트 [AGENTS.md](../../../../AGENTS.md)를 우선 적용한다.

## 목적

- 단일 NVIDIA GPU에서 LLM serving의 memory·bandwidth·scheduling 병목을 재현한다.
- Chapter 5의 hardware 한계를 확인한 뒤 Chapter 6의 optimization으로 이어 간다.
- 문서는 핸즈온 절차와 결과를 설명하는 데 필요한 이론만 담는다.
- production serving framework가 아니라 원인을 관측하고 설명하는 학습 workspace다.

## 학습 흐름은 파일 번호를 따른다

1. GPU 환경과 metric 수집 경로 확인
2. model weight 외 memory budget과 7B BF16 expected OOM 재현
3. batch·sequence length에 따라 증가하는 KV cache 확인
4. roofline으로 compute·memory bandwidth 병목 구분
5. vLLM continuous batching 관측
6. batch 전략 비교
7. prefill·decode 분리 관측
8. quantization의 memory·latency·quality 비교
9. prefix caching 효과 확인

`docs/handson/`의 번호는 설명 순서가 아니라 인과관계다. 파일을 추가·삭제·이동하면 모든 README 목차와 문서 링크를 함께 갱신한다.

## 유지해야 할 학습 시나리오

### 7B BF16 expected OOM

- `vllm-7b-bf16-expect-failure`는 API server 준비 전에 실패해야 하는 의도된 시나리오다.
- model weight가 GPU에 들어갈 것처럼 보여도 runtime overhead와 KV cache 공간까지 확보되는 것은 아니라는 점을 보여 준다.
- 시나리오를 통과시키기 위해 model 크기, dtype, memory utilization을 임의로 낮추지 않는다.
- 성공 종료로 바꾸면 02에서 03으로 이어지는 학습 흐름이 깨진다.
- OOM 중 `model-server` Prometheus target은 `DOWN`이어도 정상이다. `dcgm-exporter` target은 `UP`이어야 한다.

### OOM log와 GPU metric의 범위

- vLLM OOM log: 실패 순간 해당 process allocator의 memory
- `DCGM_FI_DEV_FB_USED`: GPU 전체 framebuffer memory의 sampled value
- Grafana GPU VRAM panel: DCGM sample의 최근 5초 최대값
- process memory와 GPU 전체 memory는 측정 범위가 다르므로 숫자가 같아야 한다고 가정하지 않는다.
- DCGM metric은 MiB다. Grafana unit은 `mbytes`를 유지한다.

## GPU 초기화 안전선

- 실습 기준은 VRAM `0 MiB`가 아니라 **실습 compute process가 없는 baseline**이다.
- `make gpu-reset`은 이 workspace의 Compose resource만 내린다.
- 다른 workspace나 container orchestrator의 GPU process가 남으면 목록을 출력하고 실패해야 한다.
- 소유권을 확인하지 않은 PID, Xorg, desktop session을 자동 종료하지 않는다.
- 외부 process를 직접 kill하는 기능을 `gpu-reset`에 추가하지 않는다.
- 자세한 판단과 복구 절차는 [docs/troubleshooting.md](docs/troubleshooting.md) 한 곳에서 관리한다.

## 관측 설정 불변 조건

- DCGM collection interval: 1초
- Prometheus `dcgm-exporter` scrape interval: 1초
- Grafana GPU panel: 최근 5초 rolling maximum
- VRAM panel unit: MiB

7B model load의 짧은 peak는 DCGM 기본 30초와 Prometheus 5초 설정에서 누락될 수 있다. 간격을 변경하면 다음 파일을 한 변경으로 맞춘다.

- `docker-compose.yml`
- `observability/prometheus.yml`
- `observability/grafana/dashboards/llm-serving.json`
- `tests/test_observability_config.py`
- `docs/prometheus.md`
- `docs/troubleshooting.md`

`make observability-check`는 다음 경로를 검증한다.

```text
nvidia-smi → DCGM Exporter → Prometheus → Grafana datasource
```

GPU utilization은 서로 다른 sample 시점의 값이므로 세 구간의 숫자 일치를 요구하지 않는다. 값의 범위, sample freshness, target·datasource health를 확인한다.

## 주요 파일 역할

- `README.md`: workspace 문서 링크 허브와 전체 학습 흐름
- `docs/handson/`: 번호 순서대로 실행하는 핸즈온
- `docs/troubleshooting.md`: GPU baseline과 관측 장애의 단일 troubleshooting 문서
- `calculators/`: 실행 전 memory budget·roofline 가설 계산
- `model_loader/`: weight load 성공·실패 경계 재현
- `benchmark/`: KV cache, batching, prefill·decode, quantization 실험
- `observability/`: Prometheus와 provisioned Grafana dashboard
- `scripts/`: 반복 실행과 검증 절차
- `tests/`: 계산기·benchmark·관측 설정 회귀 테스트

## 변경 검증

GPU가 없어도 다음 검증은 모두 실행한다.

```bash
uv run --group dev --group client pytest
uv run --group dev ruff format --check .
uv run --group dev ruff check .
bash -n scripts/*.sh
docker compose --profile observability --profile oom config
jq empty observability/grafana/dashboards/llm-serving.json
git diff --check
```

GPU 동작을 바꾸면 가능한 환경에서 다음 순서로 추가 검증한다.

```bash
make gpu-reset
make observability-check
docker compose --profile oom run --rm vllm-7b-bf16-expect-failure
```

- expected OOM 명령의 non-zero exit는 정상 결과다.
- OOM 전후 `dcgm-exporter UP`과 Prometheus의 VRAM peak를 확인한다.
- 검증용 GPU server의 주소, hostname, 사용자명, SSH alias, 절대 경로를 저장소에 기록하지 않는다.

## 공개 저장소 개인정보 규칙

- 문서, 코드, 주석, test fixture, commit, Issue, PR에 개인 환경 정보를 쓰지 않는다.
- 금지 대상: IP 주소, hostname, 사용자명, SSH 접속 정보, 개인 절대 경로, 장비 고유 ID.
- 명령 예시는 repository 상대 경로, localhost, placeholder, 환경 변수만 사용한다.
- 실제 검증 결과를 기록할 때는 학습에 필요한 metric과 일반화된 원인만 남긴다.
