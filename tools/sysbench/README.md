## 개요

* sysbench 도구 소개

## sysbench란?

* 멀티 쓰레드기반 벤치마크 도구입니다. 주로 데이터베이스 벤치마크를 수행할 때 사용합니다.

## 더미 데이터 넣기

1. mysql에 더미 데이터 천만개 넣기

* prepare 명령어 사용 사용
* 더미 데이터 개수는 --table-size로 설정합니다.
* 약 3분~5분 시간 소요

```sh
sysbench oltp_read_write \
  --mysql-host=127.0.0.1 \
  --mysql-port=3306 \
  --mysql-user=root \
  --mysql-password=password1234 \
  --mysql-db=testdb \
  --tables=1 \
  --table-size=10000000 \
  prepare
```

## 더미 데이터 삭제(table 삭제)

* cleanup 명령어 사용

```sh
sysbench oltp_read_write \
  --mysql-host=127.0.0.1 \
  --mysql-port=3306 \
  --mysql-user=root \
  --mysql-password=password1234 \
  --mysql-db=testdb \
  --tables=1 \
  cleanup
```
