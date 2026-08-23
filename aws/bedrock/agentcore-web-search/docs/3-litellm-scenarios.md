# 시나리오 1: LiteLLM

## 전제

[환경 구성](./1-setup.md)을 마치고 LiteLLM이 `http://localhost:4001`에서 정상 상태인지 확인합니다.

```bash
docker compose ps
```

LiteLLM의 AgentCore provider는 [PR #36331](https://github.com/BerriAI/litellm/pull/36331)에서 2026년 8월 19일 병합되었습니다. 안정판 `v1.98.0` 컨테이너에는 해당 코드가 없어서 이 실습은 검증한 LiteLLM `1.99.0` 이미지 digest를 고정합니다.

## 1-1. Provider 설정 확인

`litellm/config.yaml`은 `agentcore-search`를 AgentCore 검색 provider로 등록합니다. SigV4 인증은 `.runtime.env`의 임시 세션을 표준 AWS credential chain으로 읽습니다.

```yaml
search_tools:
  - search_tool_name: agentcore-search
    litellm_params:
      search_provider: agentcore
      api_base: os.environ/AGENTCORE_GATEWAY_URL
```

## 1-2. 한국어 검색

이 단계는 OpenAI를 호출하지 않고 LiteLLM `/search`만 확인합니다.

```bash
make scenario1-korean
```

실제 검증에서는 한국어 질의로 AWS의 2026년 발표 자료를 찾았고 URL, 제목, 스니펫, 게시일이 반환되었습니다. 스니펫은 원문 언어를 따를 수 있으므로 한국어 답변 생성은 모델 단계에서 처리합니다.

## 1-3. 결과 개수와 출처

```bash
./scripts/litellm_search.sh \
  "Amazon Bedrock AgentCore Web Search의 최신 리전을 찾아줘" \
  3
```

검색 결과의 `url`과 `title`을 모델 답변의 인용으로 보존합니다. 출처 없는 요약만 사용자에게 노출하면 grounded search의 장점을 잃습니다.

## 1-4. 유해 검색

```bash
make scenario1-harmful
```

검증 결과는 `results_returned`, 3건이었습니다. 스크립트는 유해한 검색 결과 본문을 출력하지 않고 반환 여부만 보여줍니다.

Web Search connector를 콘텐츠 안전 필터로 간주하면 안 됩니다. [유해 검색 대응](./5-safety.md)의 전처리와 후처리를 적용합니다.

## 1-5. OpenAI 답변 생성

`.env`에 사용자가 설정한 `OPENAI_API_KEY`가 있어야 합니다. 이 호출은 검색 결과를 OpenAI 모델이 한국어 답변으로 정리하고 출처를 포함하는 end-to-end 단계입니다.

```bash
make scenario1-openai
```

요청은 OpenAI Responses 형식의 `web_search` 도구를 사용합니다. LiteLLM의 `websearch_interception` callback이 이를 AgentCore `agentcore-search`로 바꿉니다.

현재 구현은 `stream: false`로 고정합니다. 검색 tool loop와 citation이 완결된 JSON을 확인한 뒤 streaming을 별도로 회귀 테스트하는 편이 안전합니다.

## 확인할 항목

- 답변이 한국어입니다.
- 답변의 사실이 검색 결과와 일치합니다.
- URL과 제목이 최종 응답에서 사라지지 않습니다.
- 유해 질의는 검색 전 차단됩니다.
- OpenAI 오류와 AWS 검색 오류를 구분해 기록합니다.
