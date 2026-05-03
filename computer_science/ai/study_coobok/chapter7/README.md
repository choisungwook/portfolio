# Chapter 7. Streamlit 데모를 FastAPI 백엔드로 옮기기

## 글쓴이 의도와 구현

책 챕터 7의 의도는 챕터 6의 Streamlit 데모를 **운영에 가까운 backend 구조**로 옮기는 것이다. 책은 main_v1 → main_v4로 한 파일씩 진화시킨다.

이 디렉터리는 책의 v1~v4 진화 구조를 그대로 따르되, 다음 5가지만 현대적인 패턴으로 다시 썼다.

| 항목 | 책의 방식 | 이 디렉터리의 방식 |
|---|---|---|
| SQLAlchemy | 1.x `declarative_base()` + `Column` | 2.0 `DeclarativeBase` + `Mapped[]` |
| DB session | `session = Session(); ...; session.close()` | `with db_session() as s:` 컨텍스트매니저 |
| FastAPI 응답 | `dict` 반환 | `pydantic` 응답 모델 (`AnswerResponse`, `HistoryItem`) |
| API 분기 | `ask` 안의 if/elif 사슬 | `build_system_prompt` 함수 분리 |
| Jinja 템플릿 | `main_v4.py` 안에 f-string 인라인 HTML | `src/assets/index.html`, `src/assets/answer.html` 외부 파일 |

책에는 없지만 추가한 것:

- **docker-compose.yml** — v1~v4를 8001~8004 포트로 올려서 한번에 비교 실행
- **requests.http** — VS Code REST Client로 버전별 호출

## 더 읽을 거리

- [theory](docs/theory.md) — 왜 Streamlit을 프로덕션에 안 쓰고 FastAPI로 옮겼나
- [hands-on](docs/hands-on.md) — v1~v4를 차례로 띄우고 비교하기

## 빠른 실행

`.env` 준비:

```bash
cp .env.example .env
# .env 안의 OPENAI_API_KEY를 실제 키로 바꾼다
```

전체 4개 버전을 한번에 기동:

```bash
make up
# v1: http://localhost:8001  v2: 8002  v3: 8003  v4: 8004
```

특정 버전만 기동:

```bash
make up-v1   # 또는 up-v2, up-v3, up-v4
```

종료:

```bash
make down
```
