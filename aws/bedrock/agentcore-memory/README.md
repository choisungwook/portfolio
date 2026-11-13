# Amazon Bedrock AgentCore Memory 핸즈온

ChatGPT처럼 채팅창이 여러 개인 서비스가 무엇을 어디에 기억하는지 AgentCore Memory로 실험하는 핸즈온입니다. 모델은 맥북의 Ollama(`qwen2.5:3b`)로 돌리고, OpenAI 호환 backend가 단기 메모리로 채팅창 대화를 유지하며 장기 메모리로 채팅창을 넘나드는 사실과 선호를 꺼냅니다. 모든 실습은 서울 리전(ap-northeast-2)에서 실행했습니다.

## 문서

| 순서 | 문서 | 내용 |
|---|---|---|
| 0 | [setup.md](./docs/setup.md) | Ollama 모델, Terraform, docker compose 기동과 정리, 재부팅 후 복구 |
| 1 | [1-feature-map.md](./docs/1-feature-map.md) | 기능 지도, Amazon MemoryDB와의 구분, 용어, 서울 리전 한도, 2026년 추가 기능 |
| 2 | [2-short-term-memory.md](./docs/2-short-term-memory.md) | 채팅창 하나의 멀티턴. 질문 하나만 보내도 단기 메모리로 이전 턴 복원, 스트리밍 |
| 3 | [3-chat-windows.md](./docs/3-chat-windows.md) | 채팅창 여러 개와 사용자 여러 명. 새 채팅창이 나를 기억하는 시점(약 80초)과 사용자 경계 |
| 4 | [4-long-term-memory.md](./docs/4-long-term-memory.md) | 전략별 record, 채팅창 전체 요약, 의미 검색 점수, 바뀐 정보로 record 교체, 프롬프트에 넣을 record 고르기 |
| 5 | [5-query-memory.md](./docs/5-query-memory.md) | SQL SELECT 대응표. AWS CLI로 목록, 조건, 집계, 단건, 의미 검색. 콘솔 확인 |
| 6 | [6-other-use-cases.md](./docs/6-other-use-cases.md) | IngestData로 CRM JSON 적재, 민감 event 추출 제외, episode와 reflection, 사용자 기억 삭제 |
| 7 | [7-cost.md](./docs/7-cost.md) | 과금 구조, 이 핸즈온 비용(약 0.04 USD), 사용자 1,000명 규모 추정, 정리 |
| - | [troubleshooting.md](./docs/troubleshooting.md) | 실습 중 겪은 문제 |

## 디렉터리

| 경로 | 내용 |
|---|---|
| `compose.yaml` | backend, frontend. 이미지는 로컬에서 빌드 |
| `backend/` | FastAPI. OpenAI Chat Completions 호환 API, AgentCore Memory 연동(`memory.py`) |
| `frontend/` | nginx와 정적 채팅 화면. 채팅창 목록, 대화, 메모리 패널 |
| `terraform/` | AgentCore Memory 1개와 내장 전략 4개(facts, preferences, summaries, episodes) |
| `scripts/chat.py` | OpenAI 공식 SDK로 backend에 질문을 보내는 클라이언트 |
| `scripts/forget_actor.sh` | 한 사용자의 장기 메모리 record와 단기 메모리 event 삭제 |
| `scripts/payloads/` | IngestData용 CRM JSON, episode용 장애 대응 대화 |
| `imgs/` | 채팅 화면 캡처 |
