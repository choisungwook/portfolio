# PostgreSQL 프로시저(Stored Procedure) 입문 핸즈온

## 요약

- **프로시저(Stored Procedure)는 DB 안에 저장된 코드 블록**이다. SQL문을 묶어서 하나의 이름으로 호출할 수 있다
- PostgreSQL에서 프로시저는 `CALL`로 호출하고, 값을 반환하려면 `FUNCTION`을 사용해야 한다
- 이 핸즈온에서는 계좌 입금/출금/이체 예제로 프로시저의 핵심 개념을 익힌다
- 실습환경은 Docker PostgreSQL + Python(psycopg2)으로 구성한다

## 목차

- [프로시저란?](#프로시저란)
- [프로시저 vs 함수](#프로시저-vs-함수)
- [프로젝트 구조](#프로젝트-구조)
- [환경 구성](#환경-구성)
- [SQL 스크립트 살펴보기](#sql-스크립트-살펴보기)
- [Python에서 프로시저 호출하기](#python에서-프로시저-호출하기)
- [실행하기](#실행하기)
- [참고자료](#참고자료)

## 프로시저란?

프로시저(Stored Procedure)는 두 단어를 합친 용어이다.

1. **Stored**: DB에 저장된
2. **Procedure**: 일련의 처리 절차

정리하면, **프로시저는 DB 서버에 저장되어 이름으로 호출할 수 있는 코드 블록**이다.

왜 프로시저를 쓸까? 여러 SQL문을 하나의 작업 단위로 묶을 수 있기 때문이다. 예를 들어, 계좌 이체는 출금과 입금 두 단계를 반드시 함께 실행해야 한다. 이런 로직을 프로시저로 만들면 `CALL transfer(1, 2, 5000)` 한 줄로 실행할 수 있다.

## 프로시저 vs 함수

PostgreSQL에서 프로시저와 함수는 비슷하지만 핵심적인 차이가 있다.

| 구분 | 프로시저 (PROCEDURE) | 함수 (FUNCTION) |
|------|---------------------|----------------|
| 호출 방법 | `CALL procedure_name()` | `SELECT function_name()` |
| 반환값 | 없음 | 있음 (RETURNS) |
| 트랜잭션 제어 | COMMIT/ROLLBACK 가능 | 불가능 |
| 용도 | 데이터 변경 작업 | 값 계산/조회 |

**값을 반환할 필요 없이 데이터를 변경하는 작업은 프로시저, 값을 계산해서 돌려받아야 하면 함수를 쓴다.**

## 프로젝트 구조

```
computer_science/db/procedure/
├── README.md
├── docker-compose.yaml        # PostgreSQL 컨테이너 설정
├── init/
│   └── 01_init.sql            # 테이블 + 프로시저 생성 스크립트
└── app/
    ├── requirements.txt       # Python 의존성
    └── main.py                # 프로시저 호출 예제
```

## 환경 구성

### PostgreSQL 실행

Docker Compose로 PostgreSQL을 실행한다.

```bash
docker compose up -d
```

컨테이너가 실행되면 `init/01_init.sql` 스크립트가 자동으로 실행되어 테이블과 프로시저가 생성된다. `docker-entrypoint-initdb.d` 디렉터리에 마운트된 SQL 파일은 컨테이너 최초 실행 시 자동으로 실행된다.

### DB 접속 확인

```bash
docker exec -it procedure-postgres psql -U testuser -d testdb
```

접속 후 프로시저 목록을 확인할 수 있다.

```sql
\df
```

### Python 환경 준비

```bash
cd app
pip install -r requirements.txt
```

## SQL 스크립트 살펴보기

`init/01_init.sql`에서 테이블과 프로시저를 생성한다.

### 테이블 생성

```sql
CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0
);

INSERT INTO accounts (name, balance) VALUES
  ('Alice', 10000),
  ('Bob', 5000),
  ('Charlie', 3000);
```

계좌 테이블에 3명의 사용자를 넣었다.

### 프로시저 1: 전체 계좌 조회 (파라미터 없음)

가장 간단한 형태의 프로시저다. 파라미터 없이 `CALL`만 하면 된다.

```sql
CREATE OR REPLACE PROCEDURE get_all_accounts()
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM accounts ORDER BY id LOOP
    RAISE NOTICE 'id=%, name=%, balance=%', rec.id, rec.name, rec.balance;
  END LOOP;
END;
$$;
```

`RAISE NOTICE`는 PostgreSQL의 로그 출력문이다. `CALL get_all_accounts()`로 호출하면 서버 로그에 계좌 정보가 출력된다.

### 프로시저 2: 입금 (IN 파라미터)

```sql
CREATE OR REPLACE PROCEDURE deposit(
  p_account_id INT,
  p_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION '입금 금액은 0보다 커야 합니다: %', p_amount;
  END IF;

  UPDATE accounts
  SET balance = balance + p_amount
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '계좌를 찾을 수 없습니다: id=%', p_account_id;
  END IF;
END;
$$;
```

`RAISE EXCEPTION`은 에러를 발생시킨다. 금액이 0 이하이거나 계좌가 없으면 에러가 발생하고 트랜잭션이 롤백된다.

### 프로시저 3: 출금 (잔액 검증)

```sql
CREATE OR REPLACE PROCEDURE withdraw(
  p_account_id INT,
  p_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance NUMERIC;
BEGIN
  SELECT balance INTO current_balance
  FROM accounts
  WHERE id = p_account_id;

  IF current_balance < p_amount THEN
    RAISE EXCEPTION '잔액 부족: 현재잔액=%, 출금요청=%', current_balance, p_amount;
  END IF;

  UPDATE accounts
  SET balance = balance - p_amount
  WHERE id = p_account_id;
END;
$$;
```

출금 전에 잔액을 먼저 확인한다. **잔액이 부족하면 RAISE EXCEPTION으로 에러를 발생시켜 출금을 막는다.** 이런 비즈니스 로직 검증이 프로시저를 쓰는 대표적인 이유다.

### 프로시저 4: 이체 (프로시저 안에서 프로시저 호출)

```sql
CREATE OR REPLACE PROCEDURE transfer(
  p_from_id INT,
  p_to_id INT,
  p_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  CALL withdraw(p_from_id, p_amount);
  CALL deposit(p_to_id, p_amount);
END;
$$;
```

프로시저 안에서 다른 프로시저를 `CALL`로 호출할 수 있다. 출금과 입금을 하나의 트랜잭션으로 묶었다. 출금에서 에러가 나면 입금도 실행되지 않는다.

### 함수: 잔액 조회 (RETURN이 필요한 경우)

```sql
CREATE OR REPLACE FUNCTION get_balance(p_account_id INT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance NUMERIC;
BEGIN
  SELECT balance INTO current_balance
  FROM accounts
  WHERE id = p_account_id;

  RETURN current_balance;
END;
$$;
```

값을 반환해야 하므로 `PROCEDURE`가 아니라 `FUNCTION`으로 만들었다. 호출도 `CALL`이 아니라 `SELECT get_balance(1)`로 한다.

## Python에서 프로시저 호출하기

`app/main.py`에서 psycopg2로 프로시저를 호출한다. 핵심은 `CALL` 문을 `cursor.execute()`로 실행하는 것이다.

### 프로시저 호출

```python
with conn.cursor() as cur:
  cur.execute("CALL deposit(%s, %s)", (account_id, amount))
conn.commit()
```

프로시저는 데이터를 변경하므로 반드시 `conn.commit()`을 호출해야 한다.

### 함수 호출

```python
with conn.cursor() as cur:
  cur.execute("SELECT get_balance(%s)", (account_id,))
  balance = cur.fetchone()[0]
```

함수는 `SELECT`로 호출하고 `fetchone()`으로 결과를 받는다.

### 에러 처리

```python
try:
  cur.execute("CALL withdraw(%s, %s)", (account_id, amount))
  conn.commit()
except psycopg2.errors.RaiseException as e:
  conn.rollback()
  print(f"에러 발생: {e.pgerror.strip()}")
```

프로시저에서 `RAISE EXCEPTION`이 발생하면 Python에서 `psycopg2.errors.RaiseException`으로 잡을 수 있다. **에러 발생 시 반드시 `conn.rollback()`을 호출해야 다음 쿼리를 실행할 수 있다.**

## 실행하기

### 1. PostgreSQL 컨테이너 실행

```bash
docker compose up -d
```

### 2. Python 앱 실행

```bash
cd app
pip install -r requirements.txt
python main.py
```

### 3. 실행 결과

```
==================================================
 DB 프로시저 핸즈온
==================================================

=== 전체 계좌 조회 ===
  id=1, name=Alice, balance=10000.00
  id=2, name=Bob, balance=5000.00
  id=3, name=Charlie, balance=3000.00

=== 입금: 계좌 1에 5000원 ===
  입금 완료

=== 전체 계좌 조회 ===
  id=1, name=Alice, balance=15000.00
  id=2, name=Bob, balance=5000.00
  id=3, name=Charlie, balance=3000.00

=== 출금: 계좌 2에서 2000원 ===
  출금 완료

=== 전체 계좌 조회 ===
  id=1, name=Alice, balance=15000.00
  id=2, name=Bob, balance=3000.00
  id=3, name=Charlie, balance=3000.00

=== 이체: 계좌 1 -> 계좌 3, 3000원 ===
  이체 완료

=== 전체 계좌 조회 ===
  id=1, name=Alice, balance=12000.00
  id=2, name=Bob, balance=3000.00
  id=3, name=Charlie, balance=6000.00

=== 잔액 조회: 계좌 1 ===
  잔액: 12000.00원

=== 잔액 부족 테스트: 계좌 3에서 999999원 출금 시도 ===
  예상된 에러 발생: ERROR:  잔액 부족: 현재잔액=6000.00, 출금요청=999999
```

입금 → 출금 → 이체 → 잔액 조회 → 에러 처리까지 프로시저의 핵심 패턴을 모두 확인할 수 있다.

### 4. 정리

```bash
docker compose down -v
```

`-v` 옵션은 볼륨까지 삭제한다. 다음 실행 시 `01_init.sql`이 다시 실행된다.

## 참고자료

- https://www.postgresql.org/docs/16/sql-createprocedure.html
- https://www.postgresql.org/docs/16/sql-createfunction.html
- https://www.postgresql.org/docs/16/plpgsql.html
- https://www.psycopg.org/docs/
