# 실습 환경 준비

이 문서는 로컬 macOS 환경에서 Ollama와 LiteLLM Proxy를 기동하고, k6·`xk6-sse`·`uv`를 준비하는 절차를 정리합니다. 모든 실습은 외부 클라우드 API 과금 없이 로컬 장비에서만 실행합니다.

## 사전 요구사항

실습을 시작하기 전에 아래 도구가 설치되어 있어야 합니다.

| 도구 | 용도 | 확인 명령 |
| --- | --- | --- |
| Docker Desktop | LiteLLM Proxy 컨테이너 기동 | `docker info --format '{{.ServerVersion}}'` |
| Ollama | 로컬 경량 LLM(`qwen2.5:1.5b`) 추론 | `ollama list` |
| k6 | 기본 HTTP 부하테스트 실행 | `k6 version` |
| Go + xk6 | `xk6-sse` 확장 바이너리 빌드(시나리오 4) | `go version && xk6 version` |
| uv | Python 스크립트와 AIPerf·GuideLLM 실행 | `uv --version` |

macOS Homebrew 기준 미설치 도구는 아래 명령으로 한 번에 설치합니다.

```bash
brew install k6 xk6 go uv
```

## 1. 로컬 Ollama 모델 준비

Docker 컨테이너 내부에서 Ollama를 띄우면 macOS에서는 GPU(Metal) 가속을 쓰지 못해 추론이 크게 느려집니다. 이 실습에서는 호스트 macOS에서 Ollama를 직접 실행하고, 컨테이너 안의 LiteLLM Proxy가 `host.docker.internal:11434`로 호출합니다.

먼저 로컬 Ollama에 경량 모델 `qwen2.5:1.5b`(약 986 MB)가 설치되어 있는지 확인하고, 없으면 내려받습니다.

```bash
ollama pull qwen2.5:1.5b
ollama list
```

`ollama list` 출력에 `qwen2.5:1.5b`가 보이면 준비 완료입니다.

```text
NAME            ID              SIZE      MODIFIED
qwen2.5:1.5b    65ec06548149    986 MB    ...
```

## 2. LiteLLM Proxy 기동

LiteLLM Proxy 이미지는 2026년 10월 공급망 보안 사고(`v1.107.0` 및 당시 floating 태그) 이후 키 로테이션과 서명 검증이 적용된 안전한 고정 버전 **`ghcr.io/berriai/litellm:v1.110.2`**를 사용합니다.

Admin UI의 **Logs**는 PostgreSQL에 저장된 요청 기록을 조회합니다. [Compose 설정](../compose.yaml#L3-L28)은 DB와 LiteLLM을 함께 기동하고, PostgreSQL이 연결을 받을 수 있게 된 뒤 LiteLLM을 시작합니다. 이전에 이 실습의 Proxy를 실행했다면 같은 명령으로 DB가 연결된 새 설정을 적용합니다. [LiteLLM Admin UI 요구 사항](https://docs.litellm.ai/docs/proxy/ui#quick-start)

저장소 루트에서 핸즈온 디렉터리로 이동해 두 서비스를 기동합니다.

```bash
cd computer_science/ai/litellm-sse-load-test
docker compose up -d --wait
```

컨테이너가 `Healthy` 상태가 되면 `/v1/models` 엔드포인트를 호출해 `local-qwen` 모델이 등록되었는지 확인합니다.

```bash
curl -sS http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-local-litellm-test"
```

응답의 `data`에 `local-qwen`이 있으면 LiteLLM이 모델 매핑을 읽은 상태입니다. 실제 추론은 [SSE 실습](2.3-sse-vs-http.md#실습)에서 확인합니다.

```json
{"data":[{"id":"local-qwen","object":"model","created":1677610602,"owned_by":"openai"}],"object":"list"}
```

## 3. xk6-sse 바이너리 빌드 (시나리오 4 사전 준비)

기본 `k6` 바이너리에는 SSE(Server-Sent Events) 이벤트 스트림 파싱 모듈이 없습니다. 시나리오 4에서 사용할 `xk6-sse` 확장 바이너리를 로컬에 빌드합니다.

> [!NOTE]
> 최신 `k6` 코어(`v1.8.x` / `v2.0.0`)와 `xk6-sse@latest`를 조합하면 Go 모듈 충돌로 빌드가 실패할 수 있습니다. 검증된 조합인 `k6 v0.54.0`과 `xk6-sse v0.1.3`으로 버전을 고정해 빌드합니다.

핸즈온 디렉터리 루트에서 `./k6-sse` 바이너리를 생성합니다.

```bash
cd computer_science/ai/litellm-sse-load-test
xk6 build v0.54.0 --with github.com/phymbert/xk6-sse@v0.1.3 --output ./k6-sse
./k6-sse version
```

`Build complete`가 출력되고 `./k6-sse` 파일이 생성되면 준비가 끝납니다. 이 바이너리는 `.gitignore`에 등록되어 있어 저장소에 커밋되지 않습니다.

## 4. 실습 종료 및 환경 정리

로그를 보관하면서 컨테이너를 내리려면 `docker compose down`을 사용합니다. 로그까지 지울 때는 아래 명령으로 PostgreSQL 볼륨도 삭제합니다.

```bash
cd computer_science/ai/litellm-sse-load-test
docker compose down -v
```

## Grafana 확장 실습 준비

핸즈온 디렉터리에서 기존 Compose 구성에 Grafana 구성을 추가해 실행합니다. LiteLLM, Prometheus, Pushgateway, Grafana는 같은 Compose 네트워크에 연결됩니다. macOS에서 Ollama를 실행한 상태로 시작합니다.

```bash
docker compose -f compose.yaml -f compose.grafana.yaml up -d --wait
```

Prometheus는 Compose 네트워크에서만 열리는 `litellm:4001/metrics`를 수집합니다. [부록 B의 Grafana 비교 실습](appendix-b-grafana-dashboard.md)에서 재는 클라이언트 지연은 Pushgateway로 보냅니다.

Grafana 실습을 끝내면 두 Compose 파일을 함께 지정해 컨테이너와 데이터 볼륨을 삭제합니다. 이 명령은 PostgreSQL 요청 로그, Prometheus 메트릭, Grafana 저장 데이터를 지웁니다. 대시보드 정의와 설정은 저장소 파일에 남아 다음 실행 때 다시 불러옵니다.

```bash
docker compose -f compose.yaml -f compose.grafana.yaml down -v
```

## 장비 재부팅 후 환경 복구 점검표

개인 장비에서 실습을 중단했다가 다시 이어갈 때 무엇이 남고 무엇을 다시 띄워야 하는지 아래 표로 확인합니다.

| 항목 | 재부팅 후 상태 | 복구 명령 |
| --- | --- | --- |
| Ollama 모델(`qwen2.5:1.5b`) | 디스크에 유지 | Ollama 앱 실행 또는 `ollama serve` |
| LiteLLM Proxy 컨테이너 | 중지됨 | `docker compose up -d --wait` |
| PostgreSQL 요청 로그 | `spend-logs` 볼륨에 유지 | `docker compose up -d --wait` |
| `./k6-sse` 바이너리 | 디렉터리에 유지 | 파일이 없으면 3단계 빌드 재실행 |
| `uv` 캐시(AIPerf·GuideLLM) | 로컬 캐시에 유지 | 별도 복구 불필요 |
