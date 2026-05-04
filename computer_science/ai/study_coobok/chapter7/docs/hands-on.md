# Hands-on. v1 → v4를 직접 띄워서 비교하기

책은 main_v1 → main_v4를 한 파일씩 진화시킨다. 이 디렉터리도 같은 4개 파일을 그대로 두되, docker compose로 8001~8004 포트에 동시에 올려서 차이를 직접 비교하게 만들었다.

## 사전 준비

`.env`를 만들고 OpenAI 키를 넣는다.

```bash
cp .env.example .env
# OPENAI_API_KEY=sk-... 로 교체
```

전체 4개를 한번에 기동한다.

```bash
make up
```

## v1 - 단일 /ask

LLM에 질문하고 답을 받는 가장 단순한 형태. 응답은 pydantic `AnswerResponse`로 직렬화된다.

```bash
curl -s http://localhost:8001/ask \
  -H 'content-type: application/json' \
  -d '{"question": "Configure OSPF area 0"}' | jq .
```

## v2 - device_type 분기 + /devices

같은 질문이라도 장비별로 다른 system prompt를 쓴다. 책은 if/elif 사슬을 endpoint 안에 두지만, 여기서는 `build_system_prompt(device_type)` 함수로 빼서 테스트와 재사용이 쉽게 했다.

```bash
curl -s http://localhost:8002/ask \
  -H 'content-type: application/json' \
  -d '{"question": "Configure OSPF area 0", "device_type": "cisco"}' | jq .

curl -s http://localhost:8002/devices | jq .
```

## v3 - SQLite 영속화 + /history

질문/답/장비/시각을 SQLite에 저장하고 최근 10개를 돌려준다. 책의 SQLAlchemy 1.x 스타일을 2.0 (`DeclarativeBase` + `Mapped[]`) 으로 바꿨고, 세션은 `with db_session()` 컨텍스트매니저로 누수 위험을 없앴다.

```bash
curl -s http://localhost:8003/ask \
  -H 'content-type: application/json' \
  -d '{"question": "Show BGP neighbor status", "device_type": "juniper"}' | jq .

curl -s http://localhost:8003/history | jq .
```

DB 파일은 `./data/questions.db`에 떨어진다. v3와 v4는 같은 볼륨을 공유한다.

## v4 - HTML 폼

브라우저로 `http://localhost:8004/`에 들어가면 질문 폼이 뜬다. 책은 `main_v4.py` 안에 f-string으로 HTML을 박아놨지만, 이 버전은 `src/assets/index.html`과 `answer.html`을 Jinja2Templates로 렌더링한다.

```bash
open http://localhost:8004/
# 또는: curl -s http://localhost:8004/
```

## 정리

```bash
make down       # 컨테이너만 내림
make clean      # 이미지 + data/ 까지 삭제
```

## 발표할 때 이야기 흐름

1. v1을 띄우고 `/ask` 한번 친다 → "이게 책의 시작점, FastAPI 한 줄 엔드포인트"
2. v2로 옮겨서 `/ask`에 device_type을 넣어본다 → "장비별 분기가 추가됨"
3. v3에서 같은 질문을 두 번 던지고 `/history`로 본다 → "DB 영속화가 들어옴"
4. v4를 브라우저로 연다 → "운영자가 아닌 사람용 입구도 같은 backend에 붙음"
