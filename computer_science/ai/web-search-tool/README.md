# Web search tool 실행 위치 비교 핸즈온

`client → LiteLLM → AI provider` 경로에서 web search 실행 책임을 어디에 둘지 비교한다. Client·LiteLLM뿐 아니라 Bedrock 또는 vLLM이 검색과 최종 답변 조립까지 담당하는 흐름을 확인한다.

`tool call`은 검색 실행이 아니다. 모델은 함수 이름과 인자를 만들고, client·gateway·provider의 server-side runtime 중 하나가 실제 검색을 실행해야 한다.

## 학습지

[studysheet-web-search-tool-v1.html](studysheet-web-search-tool-v1.html)에서 요청 흐름, 책임 경계, 선택 기준을 먼저 확인한다.

## 시나리오 비교

| 시나리오 | 모델 경로 | 검색 실행 | 장점 | 비용·트레이드오프 |
| --- | --- | --- | --- | --- |
| Client 소유 | client → LiteLLM → Qwen 또는 Bedrock | client → SearXNG | 같은 client 로직으로 provider 교체, gateway가 트래픽 관리에 집중 | client마다 loop·timeout·citation 검증 중복 |
| LiteLLM 소유 | client → LiteLLM → vLLM | LiteLLM interceptor → SearXNG | thin client, 검색 정책과 key 중앙화 | gateway가 agent runtime이 됨, 장애 범위·지연·디버깅 복잡도 증가 |
| Bedrock 소유 | client → LiteLLM → Nova 2 Lite | Nova Web Grounding | Client가 최종 응답만 받음, 검색 인프라 불필요 | 지원 모델·region·IAM 권한에 종속 |
| vLLM 소유 | client → LiteLLM → vLLM/Qwen | vLLM Tool Server → SearXNG MCP | 로컬 검색 backend를 유지하면서 Client는 thin하게 구성 | non-Harmony MCP가 실험적이고 serving 구성이 복잡함 |

기본 선택은 **client 소유**다. LiteLLM은 routing·auth·quota·logging 같은 트래픽 책임만 맡긴다. 여러 client가 같은 검색 정책과 자격증명을 공유해야 할 때만 LiteLLM interception을 선택한다.

## 문서

문서는 실행 순서대로 한 디렉터리에 모았다.

1. [개념과 책임 경계](docs/1-concept.md)
2. [공통 환경 준비](docs/2-setup.md)
3. [Web search 실행 주체가 없는 기준선](docs/3-no-tool-runtime-hands-on.md)
4. [Client가 web search 실행](docs/4-client-hands-on.md)
5. [LiteLLM이 web search 실행](docs/5-litellm-hands-on.md)
6. [Bedrock이 web search 실행](docs/6-bedrock-hands-on.md)
7. [vLLM이 web search 실행](docs/7-vllm-hands-on.md)

## 코드 디렉터리

| 디렉터리 | 내용 |
| --- | --- |
| [client/](client/) | OpenAI SDK로 LiteLLM을 호출하고 tool loop 실행 |
| [litellm/](litellm/) | web search interception으로 gateway가 loop 실행 |
| [ai-provider/](ai-provider/) | Bedrock Web Grounding과 vLLM server-side tool 실행 |

## vLLM을 두 번 확인하는 이유

두 시나리오는 같은 `Qwen/Qwen2.5-1.5B-Instruct`와 같은 SearXNG를 쓴다. 바뀌는 것은 검색 실행 위치뿐이다.

1. [Client hands-on](docs/4-client-hands-on.md): vLLM이 `web_search` 호출을 생성하고 client가 실행
2. [LiteLLM hands-on](docs/5-litellm-hands-on.md): vLLM이 `litellm_web_search` 호출을 생성하고 LiteLLM이 실행

## 로컬 구성

- LiteLLM: `ghcr.io/berriai/litellm:main-latest`
- Search: self-hosted SearXNG JSON API
- Local model: vLLM CPU + Qwen2.5 1.5B Instruct, macOS Docker Desktop
- Bedrock model: Client/LiteLLM 실행은 Nova Micro, provider 실행은 `us.amazon.nova-2-lite-v1:0`

`main-latest`와 `latest`는 실습 시점의 최신 동작을 확인하기 위한 선택이다. 운영에서는 검증한 digest로 고정해야 한다.

## 검증 상태

- Python unit test와 Ruff 검사 통과
- Docker Compose config 렌더링 확인
- HTML 학습지 내비게이션과 좁은 화면 확인
- Qwen과 Bedrock을 LiteLLM 뒤의 같은 Client Tool loop로 실행 확인
- Nova Web Grounding과 vLLM MCP server-side tool 경로 실행 확인

## 참고자료

- [LiteLLM Web Search Integration](https://docs.litellm.ai/docs/integrations/websearch_interception)
- [LiteLLM Search API](https://docs.litellm.ai/docs/search)
- [vLLM Tool Calling](https://docs.vllm.ai/en/stable/features/tool_calling/)
- [Amazon Bedrock tool use](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html)
- [Amazon Nova 2 Web Grounding](https://docs.aws.amazon.com/nova/latest/nova2-userguide/web-grounding.html)
- [Amazon Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [Amazon Bedrock AgentCore Web Search](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html)
