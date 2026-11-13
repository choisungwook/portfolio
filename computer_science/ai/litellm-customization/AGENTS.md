# LiteLLM Proxy 확장 지점 핸즈온 — agent 맥락

LiteLLM Proxy의 확장 지점(훅, complexity_router, custom provider, 검색)을 mock 모델 위에서 하나씩 구현하는 핸즈온이다. 글로벌 규칙은 @../../../AGENTS.md를 따른다.

- LiteLLM은 `pyproject.toml`에 고정한 버전만 쓴다. 문서의 소스 경로와 함수 이름은 그 버전의 `.venv/.../site-packages/litellm/`에서 확인한 것이다. 버전을 올리면 문서의 소스 위치를 다시 확인한다.
- 단계 N의 문서는 `docs/{N+1}-*.md`, config는 `config/{N}-*.yaml`, 테스트는 `tests/test_{N}_*.py`다.
- 실제 provider를 부르는 명령은 사용자 확인 없이 실행하지 않는다. 4·5단계의 판정 모델은 로컬 Ollama `gemma2:2b`(`num_gpu: 0`, CPU 전용)라 비용이 없다.
- 실제 SearXNG 인스턴스에는 요청을 1분에 5회 이하로만 보낸다. SearXNG가 Google 등에 요청을 대신 보내므로 몰리면 사용자 IP가 스팸 봇으로 차단될 수 있다. 실습은 `scripts/mock_searxng.py`만 쓴다.
- 시나리오는 LiteLLM 공식 기능이거나 공개 사례가 있는 것만 둔다. 이유는 `knowledge/decisions/2026-11-scenario-scope.md`.
- `gateway/`는 `uv sync`로 설치되는 패키지다. config의 `callbacks`, `custom_handler`가 `gateway.<모듈>.<인스턴스>`로 import한다.
- 3단계부터 Postgres(`compose.yaml`, host 5433)와 `prisma generate`가, 4·5단계는 Ollama와 `gemma2:2b`가, 7단계는 `scripts/mock_searxng.py`(8890)가 필요하다.

## 검증 상태

- 2026-11-13: 1~3단계 Proxy 실행 결과가 문서의 기대 출력이다.
- 2026-11-14: 4~7단계를 다시 실행했다(4·5단계는 gemma2:2b CPU, Apple M3 Pro). pytest 17개 통과. 판정 시간 값은 하드웨어마다 다르다.
- 실제 provider(OpenAI 등) 호출은 하지 않았다.
- 로드맵 이미지는 만들지 않았다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
