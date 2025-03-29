## 개요

* HikariCP를 사용하지 않은 스프링부트 예제
* [비교군 - HikariCP를 사용](../HikariCP/)

## 실행 방법

* mysql에서 사용하는 sakila 샘플 다운로드

```sh
$ make generate
[Info] Downloading sakila-db...
[Info] Unzipping sakila-db...
Archive:  sakila-db.zip
  inflating: sakila-data.sql
  inflating: sakila-schema.sql
  inflating: sakila.mwb
```

* docker compose up

```sh
docker compose up -d
```

* backend docker conatiner의 API호출

```sh
curl localhost:8081/query;
```

## 참고자료

* https://hub.docker.com/r/paketobuildpacks/builder-jammy-full
