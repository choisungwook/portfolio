# 로컬 Docker Compose 실습

## TL;DR

- Docker Compose로 LiteLLM Proxy, PostgreSQL, mock OpenAI API를 같이 실행합니다.
- mock API를 둔 이유는 실제 LLM API key 없이도 "client -> LiteLLM -> provider" 경로를 확인하기 위해서입니다.
- 실제 Bedrock 연동은 다음 문서에서 `model_list`만 바꿔 확인합니다.
- 로컬 기본 master key는 예시값입니다. 실제 환경에서는 새 값으로 바꿔야 합니다.

## 왜 mock API를 먼저 쓰는가

LiteLLM Proxy 실습에서 처음 확인할 것은 모델 품질이 아니라 요청 흐름입니다. 먼저 로컬에서 프록시가 config를 읽고, 인증을 확인하고, provider API로 요청을 넘기는지 확인합니다.

장점은 AWS 권한이나 외부 API key 없이도 프록시 구조를 볼 수 있다는 점입니다.

단점은 Bedrock의 실제 모델 권한, 리전, quota 문제는 이 단계에서 검증되지 않는다는 점입니다.

## 준비

예제 디렉터리로 이동합니다.

```shell
cd mlops/litellm-proxy
```

환경 변수 파일을 만듭니다.

```shell
cp .env.example .env
```

`.env`의 값은 실습용 예시입니다. 실제로 외부에 노출되는 환경에서는 `LITELLM_MASTER_KEY`, `LITELLM_SALT_KEY`, `POSTGRES_PASSWORD`를 새 값으로 바꿉니다.

## 실행

Compose를 실행합니다.

```shell
make up
```

컨테이너 상태를 확인합니다.

```shell
make ps
```

LiteLLM 로그를 확인합니다.

```shell
make logs
```

## 요청 보내기

LiteLLM Proxy를 통해 mock provider로 요청을 보냅니다.

```shell
make request
```

`jq`가 없다면 아래처럼 `curl`만 사용합니다.

```shell
curl -sS http://localhost:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer sk-local-change-me' \
  -d '{"model":"local-mock","messages":[{"role":"user","content":"hello"}]}'
```

응답에 `mock response through LiteLLM` 문장이 들어 있으면 요청이 LiteLLM Proxy를 통과한 것입니다.

## 설정 파일에서 볼 것

로컬 설정은 [litellm_config.yaml](../litellm_config.yaml)에 있습니다.

```yaml
model_list:
  - model_name: local-mock
    litellm_params:
      model: openai/local-mock
      api_base: http://mock-openai:8080/v1
      api_key: os.environ/MOCK_API_KEY
```

client는 `local-mock`이라는 이름만 알고 있습니다. LiteLLM은 이 이름을 보고 `litellm_params`의 provider endpoint로 요청을 보냅니다.

## 정리

컨테이너를 내립니다.

```shell
make down
```

PostgreSQL volume까지 지우려면 직접 volume을 삭제합니다.

```shell
docker volume rm litellm-proxy_litellm-postgres
```
