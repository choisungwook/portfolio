# Troubleshooting

이 실습을 로컬 macOS 환경에서 구축하고 실행하면서 실제로 겪은 문제와 해결 방법을 기록합니다.

## 1. `uv run` 실행 시 상위 디렉터리의 `.python-version`을 읽어 실패하는 문제

**증상**: 핸즈온 디렉터리에서 `uv run scripts/compare_http_sse.py`를 실행하면 아래와 같은 오류가 발생합니다.

```text
error: No interpreter found at path `3.12.1/envs/jwt`
```

**원인**: 저장소 루트에 있는 오래된 `.python-version` 파일을 `uv`가 상위 탐색으로 읽어 존재하지 않는 pyenv 가상환경 경로를 찾습니다.

**해결**: 핸즈온 workspace 루트(`computer_science/ai/litellm-sse-load-test/.python-version`)에 `3.12`를 명시해 상위 탐색을 차단했습니다.

## 2. `xk6 build --with github.com/phymbert/xk6-sse@latest` 컴파일 오류

**증상**: 버전을 지정하지 않고 `xk6 build --with github.com/phymbert/xk6-sse@latest`를 실행하면 Go 컴파일 단계에서 실패합니다.

```text
# go.k6.io/k6/v2/internal/js/compiler
.../enhanced.go:43:7: err.Position undefined (type *parser.Error has no field or method Position)
ERROR build error compiling: executing go command: exit status 1
```

**원인**: `xk6`가 기본으로 가져오는 k6 코어 버전(`v1.8.x`)과 `xk6-sse@v0.2.0`이 참조하는 `go.k6.io/k6/v2` 모듈의 내부 API가 충돌합니다.

**해결**: 서로 호환이 검증된 버전 조합으로 고정해 빌드합니다.

```bash
xk6 build v0.54.0 --with github.com/phymbert/xk6-sse@v0.1.3 --output ./k6-sse
```

## 3. GuideLLM 실행 시 `/health` 401 Unauthorized 오류

**증상**: `OPENAI_API_KEY` 환경 변수만 설정하고 `guidellm run`을 실행하면 벤치마크 시작 전 백엔드 검증 단계에서 실패합니다.

```text
httpx.HTTPStatusError: Client error '401 Unauthorized' for url 'http://localhost:4000/health'
```

**원인**: LiteLLM Proxy는 `LITELLM_MASTER_KEY`가 설정되면 `/health` 엔드포인트에도 인증 헤더를 요구합니다. GuideLLM `v0.8.1`은 `--backend` 인자에 `api_key`를 직접 전달해야 검증 요청 헤더에 키를 싣습니다.

**해결**: `--backend` 옵션에 `api_key=sk-local-litellm-test`를 명시합니다.

## 4. GuideLLM에서 LiteLLM 모델 별칭(`local-qwen`)을 토크나이저로 찾지 못하는 오류

**증상**: `--tokenizer`를 생략하고 GuideLLM을 실행하면 HuggingFace Hub에서 `local-qwen` 저장소를 찾으려다 `401 Client Error / Repository Not Found`가 발생합니다.

**원인**: LiteLLM Proxy에 등록한 논리적 모델 이름(`local-qwen`)은 HuggingFace 모델 ID가 아니기 때문입니다.

**해결**: `--tokenizer kind=huggingface_auto,model=Qwen/Qwen2.5-1.5B-Instruct`처럼 실제 백엔드 모델에 대응하는 공개 HuggingFace 토크나이저를 명시합니다.
