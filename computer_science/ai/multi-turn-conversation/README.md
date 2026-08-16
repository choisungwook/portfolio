# 멀티턴 대화 핸즈온

LLM API가 이전 대화를 기억하지 못하는 것을 직접 확인하고, 애플리케이션이 그 대화를 어디에 쌓아 두는지까지 손으로 옮겨 보는 워크스페이스다. 싱글턴 → 멀티턴 → 저장소(메모리·JSONL·Redis) → prompt cache 순서로 4단계다.

"LLM 서버단에서도 캐시한다"가 왜 사실이면서 동시에 "서버가 대화를 기억한다"는 뜻이 아닌지가 4단계의 주제다.

## 학습지

브라우저에서 [studysheet-multi-turn-conversation-v1.html](studysheet-multi-turn-conversation-v1.html)을 열면 페이지를 넘기며 읽는 학습지가 나온다. 개념은 여기에 있고, 아래 provider 문서는 실행 절차다.

## provider 고르기

디렉터리 하나를 골라 끝까지 가면 된다. 문서도 각 디렉터리 안에 있다.

| 디렉터리 | SDK | 모델 | key | 시작 문서 |
|---|---|---|---|---|
| [openai/](openai/) | `openai` | `gpt-5.6-luna` | `OPENAI_API_KEY` | [openai/docs/setup.md](openai/docs/setup.md) |
| [claude/](claude/) | `anthropic` | `claude-sonnet-5` | `ANTHROPIC_API_KEY` | [claude/docs/setup.md](claude/docs/setup.md) |

두 provider 모두 같은 파일 이름·같은 순서를 쓴다. 같은 번호는 같은 개념이고, 코드는 각 규격에 맞게 다르다.

| 파일 | 내용 |
|---|---|
| `01_stateless.py` | 단일 호출 2번. 기억하지 못하는 것을 확인 |
| `02_multi_turn.py` | history 누적 재전송 |
| `03_store.py` | 저장소만 바꾸는 CLI |
| `04_prompt_cache.py` | 서버 캐시 카운터 확인 |
| `docs/setup.md` | 환경 준비, up/down |
| `docs/1-problem.md` | 왜 잊어버리는가, 멀티턴의 두 정의 |
| `docs/2-handson.md` | 01~04 실행 절차, 기대 결과 |
| `docs/3-cleanup.md` | 트레이드오프, 저장소 고르기, 정리 |

번호 파일은 각각 자기 완결이다 — client 생성부터 API 호출까지 한 파일 안에 있다. quickstart라 공용 client 모듈을 두지 않는다.

## provider와 무관한 코드

| 파일 | 내용 |
|---|---|
| [store.py](store.py) | 저장소 3종. `load`/`append` 두 메서드만 |
| [test_store.py](test_store.py) | 저장소 테스트. API key도 Redis 서버도 필요 없음 |
| [compose.yaml](compose.yaml) | Redis 하나. 3단계에서만 필요 |

저장소가 provider와 무관하다는 것이 3단계의 결론이라 루트에 하나만 둔다.

Bedrock·Azure 등 provider를 추가하는 절차는 [AGENTS.md](AGENTS.md)에 있다.

## 검증 상태

- `store.py`, `test_store.py` — 실행해 통과 확인
- `RedisStore` — 실제 Redis 서버에 붙여 왕복 확인
- `compose.yaml` — `docker compose config` 통과, `up`은 미검증
- `openai/`, `claude/`의 01~04 — 작성 환경에 API key가 없어 실행하지 못했다. 문서의 출력 예시는 캡처가 아니라 예상값이다
