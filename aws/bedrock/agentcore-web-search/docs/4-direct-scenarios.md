# 시나리오 2: 직접 호출

## 전제

[환경 구성](./1-setup.md)의 Terraform과 runtime env 생성을 마칩니다.

```bash
make infra-up runtime-env
```

## 2-1. curl과 SigV4

curl의 `--aws-sigv4` 옵션으로 MCP `tools/list`를 호출해 도구 이름을 찾은 뒤 `tools/call`을 실행합니다.

```bash
make scenario2-curl
```

다른 한국어 질의도 인자로 전달할 수 있습니다.

```bash
set -a
. ./.runtime.env
set +a
./scripts/direct_curl.sh "서울 리전의 최신 AWS 소식을 찾아줘"
```

## 2-2. Python과 Boto3 credential chain

Python 클라이언트는 Boto3가 찾은 임시 세션으로 MCP 요청을 SigV4 서명합니다. JSON과 SSE 응답을 모두 처리합니다.

```bash
make scenario2-python
```

```bash
set -a
. ./.runtime.env
set +a
.venv/bin/python scripts/direct_search.py \
  "Amazon Bedrock AgentCore Web Search의 최신 변경점을 찾아줘" \
  --max-results 3
```

실제 검증에서는 한국어 질의와 `maxResults=3`이 정상 처리되었습니다. 검색 결과 스니펫의 언어는 원문에 따라 달랐습니다.

## 2-3. 유해 검색

```bash
make scenario2-harmful
```

직접 호출도 유해 질의에 3건을 반환했습니다. 테스트는 본문을 버리고 결과 개수만 기록하므로 위험한 내용을 다시 노출하지 않습니다.

## 운영으로 옮길 때

- 임시 Access Key 환경 변수 대신 instance profile 또는 workload IAM role을 사용합니다.
- Gateway URL은 환경별 설정 저장소에서 주입합니다.
- query와 검색 결과를 그대로 애플리케이션 로그에 남기지 않습니다.
- 네트워크 timeout, 429, 5xx에 지수 backoff와 제한된 재시도를 적용합니다.
