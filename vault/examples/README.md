
<!-- TOC -->

- [준비](#%EC%A4%80%EB%B9%84)
  - [sakila 샘플이 있는 mysql 도커 컨테이너 생성](#sakila-%EC%83%98%ED%94%8C%EC%9D%B4-%EC%9E%88%EB%8A%94-mysql-%EB%8F%84%EC%BB%A4-%EC%BB%A8%ED%85%8C%EC%9D%B4%EB%84%88-%EC%83%9D%EC%84%B1)
- [실습](#%EC%8B%A4%EC%8A%B5)
  - [vault 실행](#vault-%EC%8B%A4%ED%96%89)
  - [vault주소를 환경변수로 설정](#vault%EC%A3%BC%EC%86%8C%EB%A5%BC-%ED%99%98%EA%B2%BD%EB%B3%80%EC%88%98%EB%A1%9C-%EC%84%A4%EC%A0%95)
  - [vault login](#vault-login)
  - [vault secret 엔진을 v2로 변경](#vault-secret-%EC%97%94%EC%A7%84%EC%9D%84-v2%EB%A1%9C-%EB%B3%80%EA%B2%BD)
  - [vault에 mysql 유저, 비밀번호 정보 설정](#vault%EC%97%90-mysql-%EC%9C%A0%EC%A0%80-%EB%B9%84%EB%B0%80%EB%B2%88%ED%98%B8-%EC%A0%95%EB%B3%B4-%EC%84%A4%EC%A0%95)
  - [vault policy 생성](#vault-policy-%EC%83%9D%EC%84%B1)
  - [vault token 생성](#vault-token-%EC%83%9D%EC%84%B1)
  - [파이썬 예제 실행](#%ED%8C%8C%EC%9D%B4%EC%8D%AC-%EC%98%88%EC%A0%9C-%EC%8B%A4%ED%96%89)
- [참고자료](#%EC%B0%B8%EA%B3%A0%EC%9E%90%EB%A3%8C)

<!-- /TOC -->

## 준비

### sakila 샘플이 있는 mysql 도커 컨테이너 생성

* [설치 메뉴얼 바로가기](../../common/mysql_sakila_sample)

## 실습

### vault 실행
* 개발모드로 vault 실행
```sh
vault server -dev
```
### vault주소를 환경변수로 설정

```sh
export VAULT_ADDR='http://localhost:8200'
```

### vault login

```sh
vault login
```

### vault secret 엔진을 v2로 변경

```sh
vault secrets disable secret
vault secrets enable -path=secret -version=2 kv
```

### vault에 mysql 유저, 비밀번호 정보 설정

```sh
vault kv put -mount=secret database/mysql username="root" password="NwmaZk$2f2pq27p^^4am" database="sakila"
```

### vault policy 생성

```sh
vault policy write mysql-read-policy ./examples/policy.hcl
```

### vault token 생성

```sh
vault write identity/entity name="bob" policies="mysql-read-policy"
vault token create -policy="mysql-read-policy" -display-name="bob"
```

### 파이썬 예제 실행

```sh
cd examples/python_app

# poetry 프로젝트 초기화
poetry install

# vault를 사용하지 않는 에쩨
python not_use_vault.py

# vault를 사용하는 예제
python use_vault.py
```

## 참고자료
* https://qiita.com/nittamatama/items/8be0159cce302c225bd2
