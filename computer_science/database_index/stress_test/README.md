## 개요

* RDMS index 부하테스트

## k6로 부하테스트

1. database에서 c필드 확인

2. 테스트 스크립트에서 c필드 수정

```sh
$ cat load-test-by-c.js
const targetC = '73754818686-04889373966-18668178968-56957589012-31352882173-91882653509-59577900152-88962682169-52981807259-62646890059';
```

```sh
k6 load-test-by-c.js
```

## sysbench로 DB 부하 생성

```sh
brew install sysbenc
```

--threads=16       # 동시 실행 쓰레드 수
--time=60          # 테스트 실행 시간 (초)
--report-interval=10 # 중간 결과 출력 간격 (초)

```sh
sysbench test_query.lua \
  --mysql-host=127.0.0.1 \
  --mysql-port=30080 \
  --mysql-user=root \
  --mysql-password=password1234 \
  --mysql-db=testdb \
  --threads=16 \
  --time=60 \
  --report-interval=10 \
  run
```
