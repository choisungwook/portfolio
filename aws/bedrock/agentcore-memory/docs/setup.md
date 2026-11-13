# 실습 환경 준비와 정리

AWS에는 AgentCore Memory 리소스 하나만 만들고, 모델과 채팅 화면은 맥북에서 실행합니다. 모델은 Ollama의 `qwen2.5:3b`(약 1.9GB)를 쓰며 Apple M3 맥북에서 한 번 답하는 데 2~5초가 걸립니다. 모든 명령은 AWS CLI의 `default` 프로파일을 씁니다. 다른 프로파일을 쓰려면 셸에서 `export AWS_PROFILE=<프로파일>`을 먼저 실행합니다.

## 준비물

| 도구 | 확인한 버전 | 용도 |
|---|---|---|
| AWS CLI | 2.40.2 | `--namespace-path`, `ingest-data`, `--extraction-mode`를 지원하는 버전이 필요 |
| Terraform | 1.13.3 (AWS provider 6.73) | Memory와 전략 생성 |
| Docker Desktop | 29.9.3 | backend, frontend 컨테이너 빌드와 실행 |
| Ollama | macOS 앱 | 로컬 모델 서버(포트 11434) |
| uv | 0.11.17 | `scripts/chat.py` 실행 |

| 포트 | 서비스 |
|---|---|
| 11434 | Ollama (맥북에서 직접 실행) |
| 8000 | backend, OpenAI 호환 API |
| 8080 | frontend, 채팅 화면 |

## 기동

### 1. 로컬 모델 내려받기

Ollama 앱이 켜져 있어야 컨테이너가 `host.docker.internal:11434`로 모델을 호출할 수 있습니다.

```bash
ollama pull qwen2.5:3b
```

모델 목록에 `qwen2.5:3b`가 보이면 준비가 끝난 것입니다.

```bash
curl -s localhost:11434/api/tags | grep -o '"qwen2.5:3b"'
```

### 2. AgentCore Memory 생성

저장소 루트에서 시작해 workspace로 이동한 뒤 Memory 하나와 내장 전략 4개를 만듭니다.

```bash
cd aws/bedrock/agentcore-memory/terraform
terraform init
terraform apply
```

전략은 하나씩 순서대로 붙기 때문에 apply가 끝나기까지 약 10분이 걸립니다(2026-11-14 측정 9분 55초). 출력의 `runtime_env`에 Memory ID와 전략 ID가 나오며, ID 뒤쪽 10자리는 실행마다 달라집니다.

```text
memory_id = "chat_memory_handson-6zXYmhCh5n"
runtime_env = <<EOT
AWS_REGION=ap-northeast-2
MEMORY_ID=chat_memory_handson-6zXYmhCh5n
STRATEGY_FACTS=facts-NvvwAO7Tog
STRATEGY_PREFERENCES=preferences-3rA97NCr6K
STRATEGY_SUMMARIES=summaries-CT8gci4g2v
STRATEGY_EPISODES=episodes-vuw1AXHOdF
EOT
```

### 3. backend가 읽을 환경 파일 생성

backend 컨테이너와 CLI 예제는 모두 이 파일에서 Memory ID를 읽습니다. 파일은 git에 올라가지 않습니다.

```bash
cd ..
terraform -chdir=terraform output -raw runtime_env > .runtime.env
```

### 4. backend와 frontend 빌드, 기동

이미지는 원격 레지스트리에서 받지 않고 로컬에서 빌드합니다. `~/.aws`는 읽기 전용으로 컨테이너에 마운트되어 backend가 `default` 프로파일로 AgentCore Memory를 호출합니다. `default` 프로파일을 `aws login`으로 만들었다면 로그인 세션이 살아 있어야 하므로, 만료되었으면 먼저 `aws login`을 실행합니다([troubleshooting.md](./troubleshooting.md)).

```bash
docker compose up -d --build
```

### 5. 기동 확인

backend가 OpenAI의 `GET /v1/models` 형식으로 모델을 돌려주는지 확인합니다.

```bash
curl -s localhost:8000/v1/models
```

```text
{"object":"list","data":[{"id":"qwen2.5:3b","object":"model","owned_by":"ollama"}]}
```

브라우저에서 `http://localhost:8080`을 열면 왼쪽에 사용자(actorId)와 채팅창 목록, 가운데에 대화, 오른쪽에 메모리 패널이 보입니다.

## 이후 문서에서 쓰는 셸 변수

CLI 예제는 모두 workspace 디렉터리(`aws/bedrock/agentcore-memory`)에서 아래를 먼저 실행했다고 가정합니다. `AWS_REGION`이 export되므로 `--region`을 따로 붙이지 않습니다.

```bash
set -a; source .runtime.env; set +a
export AWS_PAGER=""
```

## 정리

실습이 끝나면 AWS 비용이 더 나오지 않도록 Memory를 지우고, 로컬 이미지와 빌드 캐시도 함께 지웁니다. 순서는 컨테이너 → AWS 리소스 → 확인입니다.

### 1. 컨테이너, 로컬 빌드 이미지, 빌드 캐시 삭제

`--rmi local`은 이 compose 파일이 빌드한 이미지(`agentcore-memory-backend:local`, `agentcore-memory-frontend:local`)만 지웁니다. 빌드 캐시는 builder prune으로 따로 지웁니다.

```bash
docker compose down --rmi local -v
docker builder prune -f
```

이미지가 남아 있지 않은지 확인합니다. 출력이 비어 있어야 합니다.

```bash
docker images --filter reference='agentcore-memory-*'
```

### 2. AgentCore Memory 삭제

Memory를 지우면 그 안의 단기 메모리 event와 장기 메모리 record가 함께 사라지므로 record를 따로 지울 필요가 없습니다. 전략을 하나씩 지우기 때문에 약 12분이 걸립니다.

```bash
terraform -chdir=terraform destroy
```

### 3. 남은 리소스 확인

이 핸즈온의 Memory가 목록에 없으면 과금 대상이 남지 않은 것입니다. 삭제는 비동기라 `DELETING` 상태가 잠시 보일 수 있습니다.

```bash
aws bedrock-agentcore-control list-memories --query 'memories[?starts_with(id, `chat_memory_handson`)].[id,status]' --output text
```

### 4. 로컬 모델 삭제 (선택)

다른 실습에서 쓰지 않는다면 모델도 지웁니다.

```bash
ollama rm qwen2.5:3b
```

## 맥북을 다시 켠 뒤 환경 복구

AWS 쪽은 그대로 남아 있고 로컬 프로세스만 멈춥니다. 맥북을 다시 켜도 단기 메모리 event(7일 보존)와 장기 메모리 record는 남아 있으므로, 그 사이에도 장기 메모리 저장 비용은 계속 나옵니다.

| 대상 | 재부팅 후 상태 | 복구 방법 |
|---|---|---|
| AgentCore Memory, event, record | 남음 | 없음 |
| `.runtime.env` | 남음 | 없음 |
| Ollama 서버 | 앱을 켜야 실행됨 | Ollama 앱 실행 |
| backend, frontend 컨테이너 | Docker Desktop을 켜면 멈춘 상태로 남음 | `docker compose up -d` |

복구 후 `curl -s localhost:8000/v1/models`가 모델을 돌려주면 이어서 실습할 수 있습니다.
