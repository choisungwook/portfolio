# 로컬 개발환경 설정

* mysql 컨테이너 실행

```sh
docker-compose up -d
```

* 환경변수 설정하기 위해 .env파일 생성

```sh
$ cd memo_project
$ vi .env
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=memo_db
DATABASE_USER=memo
DATABASE_PASSWORD=password
```