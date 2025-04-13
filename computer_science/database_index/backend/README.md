

## 실행방법

1. 파이썬 패키지 설치

```sh
uv python install 3.12
uv venv
source ./.venv/bin/activate
uv install -r requirements.txt
```

2. mysql docker conatiner 실행

```sh

```


3. 실행

```sh
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```


```sh
uv run ruff check --fix
uv format ./*.py
```


## 테스트

```sh
curl http://127.0.0.1:8000/posts/1
```
