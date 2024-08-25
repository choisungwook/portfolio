# 로컬 개발환경 설정

* mysql 컨테이너 실행

```sh
docker-compose up -d
```

* 환경변수 설정하기 위해 .env파일 생성

```sh
$ cd memo_project
$ vi .env
DEBUG=True
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=memo_db
DATABASE_USER=memo
DATABASE_PASSWORD=password
```

# 로컬 실행 방법
* 파이썬 패키지 설치

```sh
# poetry 파이썬 가상환경 실행
$ poetry shell
# 파이썬 패키지 설치
$ poetry install
```

* django 실행

```sh
python manage.py runserver
```

* 웹브라우저에서 http://127.0.0.1:8000/ 접속