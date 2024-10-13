#

# 준비
## mysql 생성
1. mysql sakila databae 예제 sql 다운로드

```sh
mkdir initdb
cd initdb
curl -O 'https://downloads.mysql.com/docs/sakila-db.zip'
unzip -j sakila-db.zip && rm sakila-db.zip
```

2. mysql docker container가 schema생성 후 data를 초기화 하기 위해, sql를 한개 파일로 병합

```sh
cd initdb
cat sakila-schema.sql sakila-data.sql > init.sq
```

3. docker container 실행

```sh
docker compose up -d
```

# 실습

## vault 실행
* 개발모드로 vault 실행
```sh
vault server -dev
```

## vault주소를 환경변수로 설정

```sh
export VAULT_ADDR='http://localhost:8200'
```

## vault login

```sh
vault login
```

## vault secret 엔진을 v2로 변경

```sh
vault secrets disable secret
vault secrets enable -path=secret -version=2 kv
```

## vault에 mysql 유저, 비밀번호 정보 설정

```sh
vault kv put -mount=secret database/mysql username="root" password="NwmaZk$2f2pq27p^^4am" database="sakila"
```

## vault policy 생성

```sh
vault policy write mysql-read-policy ./examples/policy.hcl
```

## vault token 생성

```sh
vault write identity/entity name="bob" policies="mysql-read-policy"
vault token create -policy="mysql-read-policy" -display-name="bob"
```

## 파이썬 예제 실행

```sh
cd examples/python_app

# poetry 프로젝트 초기화
poetry install

# vault를 사용하지 않는 에쩨
python not_use_vault.py

# vault를 사용하는 예제
python use_vault.py
```

# 참고자료
* https://qiita.com/nittamatama/items/8be0159cce302c225bd2
