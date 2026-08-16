# 멀티턴 대화 핸즈온 — agent 맥락

이 파일은 이 workspace(`computer_science/ai/multi-turn-conversation`)에서 작업하는 agent를 위한 맥락이다. 저장소 전체 규칙은 루트 [AGENTS.md](../../../AGENTS.md)를 따른다.

## 목적

LLM API가 이전 대화를 기억하지 못한다는 것을 직접 확인하고, 그 대화가 실제로 어디에 쌓이는지까지 옮겨 보는 학습용 워크스페이스다. 학습 축은 네 단계다: 싱글턴(잊음) → 멀티턴(누적 재전송) → 저장소(memory·jsonl·redis) → prompt cache(서버 캐시는 기억이 아님).

## 핵심 규칙 — quickstart를 유지한다

**번호 붙은 파일은 각각 자기 완결이다.** 파일 하나만 열어도 client 생성부터 API 호출까지 전부 보여야 한다.

- **공용 client 모듈을 만들지 않는다.** `client.py` 같은 파일로 호출을 감싸면 학습자가 정작 봐야 할 API 호출이 파일 밖으로 사라진다. client 생성 3줄은 파일마다 반복해서 쓴다.
- **프로덕션 추상화를 넣지 않는다.** ABC, 팩토리, 설정 클래스, 재시도 래퍼, 비동기 전부 해당한다.
- **파일 하나는 개념 하나.** 한 화면에 들어와야 한다. 코드가 길어지면 개념이 아니라 코드를 공부하게 된다.

반복이 생기는 것은 의도한 비용이다. DRY보다 "한 파일만 읽으면 된다"가 우선이다.

예외는 `store.py` 하나다. 이 파일은 API 호출을 감싸는 추상화가 아니라 3단계의 학습 대상 자체이고, provider와 무관하다는 것이 그 단계의 결론이다. provider 디렉터리마다 복사하면 그 결론이 흐려진다. `03_store.py`가 `sys.path` 한 줄로 상위 디렉터리에서 불러오는 구조를 그대로 둔다.

## 현재 상태

- `store.py`, `test_store.py` — 실행해 통과 확인
- `RedisStore` — 실제 Redis 서버(brew redis-server)에 붙여 왕복 확인
- `compose.yaml` — `docker compose config` 통과. 작성 환경의 Docker Desktop이 keychain 인증 실패라 `up`은 미검증
- `openai/`, `claude/`의 01~04 — 작성 환경에 API key가 없어 미실행. 모듈 로드까지만 확인했고, 문서의 출력 예시는 캡처가 아니라 예상값이다

## 구조

```text
store.py         저장소 3종. provider와 무관하므로 루트에 하나만 둔다
test_store.py    저장소 테스트. API key도 Redis 서버도 필요 없다
compose.yaml     Redis 하나. 03단계에서만 필요하다
openai/          OpenAI quickstart + 전용 docs
claude/          Anthropic quickstart + 전용 docs
studysheet-*.html  학습지(akbun-studysheet 스타일)
```

## provider 디렉터리 규약

**provider 디렉터리는 파일 이름과 순서가 전부 같고, 각자 자기 docs를 갖는다.** 학습자는 디렉터리 하나만 골라 끝까지 가면 되고, 공용 문서를 왔다 갔다 하지 않는다.

```text
<provider>/
  01_stateless.py      단일 호출 2번. 기억하지 못하는 것을 확인
  02_multi_turn.py     history 누적 재전송
  03_store.py          저장소만 바꾸는 CLI
  04_prompt_cache.py   서버 캐시 카운터 확인
  docs/
    setup.md           환경 준비. up/down 두 스텝. 다른 문서는 여기 링크만 건다
    1-problem.md       왜 잊어버리는가, 멀티턴의 두 정의
    2-handson.md       01~04 실행 절차, 기대 결과, 체크포인트
    3-cleanup.md       트레이드오프, 저장소 고르기, 정리
```

같은 번호는 두 디렉터리에서 같은 개념을 가르친다. 코드는 provider 규격 때문에 다르지만, **누적 로직의 모양은 같게 유지한다** — `01`은 히스토리 없이 두 번 호출, `02`는 `ask(history, question)`이 append → 전송 → append, `03`은 store만 갈아 끼우는 CLI, `04`는 캐시 카운터 출력. 학습자가 두 문서를 번갈아 읽어도 같은 자리에서 같은 이야기를 만나야 한다.

각 `2-handson.md`는 자기 규격에서 실제로 다른 지점(system 프롬프트 위치, 응답 파싱, 출력 토큰 파라미터 이름, 캐시 방식)을 명시하고, 상대 provider 문서로 링크를 건다.

## provider 추가하는 방법

Bedrock, Azure OpenAI, Vertex 등을 추가할 때 절차는 다음과 같다.

1. `<provider>/` 디렉터리와 `<provider>/docs/`를 만든다. 이름은 소문자 하이픈. 예: `bedrock/`, `azure-openai/`
2. 가장 가까운 규격에서 `01`~`04`를 복사한다
   - OpenAI 규격(Azure OpenAI, LiteLLM, Bifrost 등)이면 `openai/`에서
   - Anthropic 규격(Bedrock의 Anthropic 모델 등)이면 `claude/`에서
3. 각 파일의 client 생성 3줄과 `MODEL`을 그 provider에 맞게 고친다. **파일을 합치거나 client를 모듈로 빼지 않는다**
4. `04_prompt_cache.py`는 그 provider의 캐시 방식에 맞춰 고친다. 캐시를 지원하지 않으면 파일을 지우고 그 사실을 `docs/2-handson.md`에 한 줄 남긴다
5. `docs/` 4종을 복사해 엔드포인트 이름·key 이름·모델명·실행 경로를 고친다
6. `pyproject.toml`에 SDK를 추가한다
7. 인덱스 두 곳을 갱신한다 — 이 파일의 provider 표, [README.md](README.md)의 provider 표

### 현재 provider

| 디렉터리 | SDK | 모델 | key | 출력 토큰 파라미터 | 캐시 |
|---|---|---|---|---|---|
| [openai/](openai/) | `openai` | `gpt-5.6-luna` | `OPENAI_API_KEY` | `max_completion_tokens` | 자동. `usage.prompt_tokens_details.cached_tokens` |
| [claude/](claude/) | `anthropic` | `claude-sonnet-5` | `ANTHROPIC_API_KEY` | `max_tokens` | 명시적 `cache_control`. `usage.cache_read_input_tokens` |

`openai/`는 실제 OpenAI 모델을 쓴다. Anthropic의 OpenAI 호환 엔드포인트로 Claude를 감싸 부르지 않는다 — 그러면 두 디렉터리가 같은 모델을 부르게 되어 비교가 성립하지 않고, 호환 레이어는 prompt caching을 지원하지 않아 `04`가 항상 0을 찍는다.

## ADR (결정 - 이유)

- 결정: 번호 파일마다 client 생성을 반복해 쓰고 공용 client 모듈을 두지 않는다. / 이유: quickstart의 학습 대상이 API 호출 그 자체다. 모듈로 감싸면 봐야 할 코드가 파일 밖으로 나간다. 중복 3줄이 간접 참조 한 단계보다 싸다.
- 결정: docs를 provider 디렉터리 안에 각각 둔다. / 이유: 학습자는 provider 하나를 골라 끝까지 간다. 공용 docs는 매 문단에서 "당신 provider면 이렇게"를 분기시켜 읽기를 방해한다. 문서 중복은 그 대가로 감수한다.
- 결정: `openai/`는 실제 GPT 모델을 쓴다. / 이유: 두 디렉터리가 서로 다른 provider를 부르는 것이 비교의 전제다. 호환 엔드포인트로 Claude를 감싸면 규격만 다르고 모델은 같아져 04단계가 성립하지 않는다.
- 결정: `store.py`만 루트에 공용으로 둔다. / 이유: 저장소가 provider와 무관하다는 것이 3단계의 결론이다. 복사하면 provider마다 다를 수 있다는 잘못된 인상을 준다. client 모듈과 달리 API 호출을 감추지도 않는다.
