# LiteLLM Proxy 확장 지점 핸즈온 — agent 맥락

LiteLLM Proxy의 확장 지점(훅, custom provider, 검색)을 mock 모델 위에서 하나씩 구현하는 핸즈온이다. 글로벌 규칙은 @../../../AGENTS.md를 따른다.

- LiteLLM은 `pyproject.toml`에 고정한 버전만 쓴다. 문서의 소스 경로와 함수 이름은 그 버전의 `.venv/.../site-packages/litellm/`에서 확인한 것이다. 버전을 올리면 문서의 소스 위치를 다시 확인한다.
- 단계 N의 문서는 `docs/{N+1}-*.md`, config는 `config/{N}-*.yaml`, 테스트는 `tests/test_{N}_*.py`다.
- 실제 provider를 부르는 명령은 사용자 확인 없이 실행하지 않는다.
- `gateway/`는 `uv sync`로 설치되는 패키지다. config의 `callbacks`, `custom_handler`가 `gateway.<모듈>.<인스턴스>`로 import한다.
- 3단계부터 Postgres(`compose.yaml`, host 5433)와 `prisma generate`가, 9단계부터 `scripts/mock_searxng.py`(8890)가 필요하다.

## 검증 상태

- 2026-11-13: 1~12단계 모든 Proxy 실행과 pytest 31개를 mock 모델로 실행했다. 문서의 기대 출력은 그 실행 결과다.
- 실제 provider(OpenAI 등) 호출은 하지 않았다. `tools: [{"type": "web_search"}]`가 실제 provider에서 거절되는지는 확인하지 않았다(7단계 문서에 명시).
- 로드맵 이미지는 만들지 않았다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
