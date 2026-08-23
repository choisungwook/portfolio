# Bedrock 내장 Web Search

[환경 구성](./1-setup.md)의 로컬 인증과 사용자 설정을 완료합니다. AgentCore 인프라와 LiteLLM은 사용하지 않습니다.

## 호출 구조

- Amazon Bedrock의 `bedrock-mantle` endpoint 사용
- OpenAI Responses API 형식 사용
- 검색, 페이지 조회, 답변 생성, 인용을 한 요청에서 처리

```text
OpenAI SDK → Bedrock Mantle → Web Search 서버 도구 → GPT-5.6 Luna → 답변과 인용
```

## 인증

`aws-bedrock-token-generator`가 AWS credential chain을 읽고 단기 Bedrock API key를 만듭니다. 장기 API key는 저장하지 않습니다.

```python
from openai import OpenAI

from aws_bedrock_token_generator import provide_token

region = "us-east-1"
client = OpenAI(
  base_url=f"https://bedrock-mantle.{region}.api.aws/openai/v1",
  api_key=provide_token(region=region),
)
```

## Web Search 호출

`external_web_access=False`로 AWS 검색 인덱스와 캐시만 사용합니다. 이 설정에는 `bedrock-websearch:ExternalWebAccess` 권한이 필요하지 않습니다.

```python
response = client.responses.create(
  model="openai.gpt-5.6-luna",
  input="What were the key announcements at AWS re:Invent 2025?",
  tools=[{"type": "web_search", "external_web_access": False}],
)
```

질의를 지정해 실행합니다.

```bash
uv run --env-file .env python scripts/bedrock_web_search.py \
  "What were the key announcements at AWS re:Invent 2025?"
```

## 응답 확인

- `web_search_call.action`: 검색 쿼리와 페이지 조회 단계
- `message.content[].text`: 최종 답변
- `url_citation` annotation: 출처 제목과 URL

관련 구현입니다.

- `src/agentcore_web_search/bedrock_client.py`
- `src/agentcore_web_search/output.py`
- `scripts/bedrock_web_search.py`

## 참고 자료

- [Amazon Bedrock Web Search](https://docs.aws.amazon.com/bedrock/latest/userguide/web-search.html)
- [Amazon Bedrock Responses API](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html)
- [Amazon Bedrock 단기 API key](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-generate.html)
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
