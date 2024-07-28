# 개요
* django + ninja API framework 예제

# 설치방법

```sh
$ pip install poetry
$ poetry shell
$ poetry install
$ python manage.py runserver
```

# API 목록

> swagger 문서 참고: http://127.0.0.1:8000/api/docs

* [http://127.0.0.1:8000/api/ping](./ping/api.py)
* [http://127.0.0.1:8000/api/ping/hello](./ping/api.py)

# 이 예제에서 알게 된 것

* ninja framework는 FastAPI처럼 api 객체를 리턴한다.
* 따라서, api객체를 다루는 것이 ninja framework의 핵심이다.
* FastAPI와 같이 중첩(Nested) router를 지원한다. 이 예제에서는 중첩 router를 사용했다.
* 다음 예제는 uvicorn 연동을 할 예정!
