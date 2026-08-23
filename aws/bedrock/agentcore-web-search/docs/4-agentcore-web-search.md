# AgentCore Web Search

[환경 구성](./1-setup.md)의 AgentCore 기동을 완료합니다.

## 호출 구조

- AWS CLI로 AgentCore Gateway, IAM, CloudWatch Logs와 connector target 관리
- LiteLLM이 OpenAI Responses API의 `web_search` 요청을 AgentCore search provider로 변환
- OpenAI 모델이 검색 결과를 바탕으로 답변과 출처 생성

```text
OpenAI SDK → LiteLLM Responses API → AgentCore Gateway → Web Search connector
           → OpenAI 모델 → 답변과 인용
```

## 리소스 관리

`scripts/create-agentcore-resources.sh`는 IAM 역할, Gateway, target, CloudWatch Logs 전송을 순서대로 생성합니다. 모든 AWS 명령은 `us-east-1`을 명시합니다.

`scripts/install-web-search-target.sh`는 같은 이름의 target이 없으면 생성하고, 있으면 갱신합니다. `scripts/delete-agentcore-resources.sh`는 의존 관계의 역순으로 전체 리소스를 삭제합니다.

## OpenAI Responses 호출

애플리케이션은 OpenAI SDK로 LiteLLM만 호출합니다. LiteLLM callback이 `web_search`를 `agentcore-search`에 연결합니다.

```python
from openai import OpenAI

client = OpenAI(
  base_url="http://localhost:4001/v1",
  api_key="sk-local-agentcore",
)

response = client.responses.create(
  model="openai-search-agent",
  input="2026년 8월 Amazon Bedrock의 최신 웹 검색 기능을 설명해줘",
  tools=[{"type": "web_search"}],
)
```

질의를 지정해 실행합니다.

```bash
uv run --env-file .env python scripts/agentcore_web_search.py \
  "Amazon Bedrock AgentCore Web Search의 최신 변경점을 찾아줘"
```

## 응답 확인

- 답변과 검색 결과의 일치 여부
- 최종 응답의 출처 제목과 URL
- OpenAI 모델 오류와 AgentCore 검색 오류의 구분

Web Search connector는 유해 질의를 자동 차단하지 않습니다. 안전성 검사는 [유해 검색 대응](./5-safety.md)을 따릅니다.

## 구성 파일

- `scripts/create-agentcore-resources.sh`: IAM, Gateway, target, 로그 전송 생성
- `scripts/delete-agentcore-resources.sh`: AgentCore와 IAM 리소스 삭제
- `scripts/install-web-search-target.sh`: target 생성과 갱신
- `scripts/delete-web-search-target.sh`: target 삭제
- `litellm/config.yaml`: AgentCore search provider와 OpenAI interception
- `src/agentcore_web_search/agentcore_client.py`: OpenAI SDK 클라이언트
- `scripts/agentcore_web_search.py`: 실행 예제

## 참고 자료

- [AgentCore Web Search Tool](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html)
- [Gateway target 구성](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-add-target-api-target-config.html)
