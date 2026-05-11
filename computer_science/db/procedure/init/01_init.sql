-- 테이블 생성
CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0
);

INSERT INTO accounts (name, balance) VALUES
  ('Alice', 10000),
  ('Bob', 5000),
  ('Charlie', 3000);

-- 프로시저 1: 전체 계좌 조회 (파라미터 없음)
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

-- 프로시저 2: 입금 (IN 파라미터)
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

-- 프로시저 3: 출금 (IN 파라미터 + 잔액 검증)
CREATE OR REPLACE PROCEDURE withdraw(
  p_account_id INT,
  p_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION '출금 금액은 0보다 커야 합니다: %', p_amount;
  END IF;

  SELECT balance INTO current_balance
  FROM accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '계좌를 찾을 수 없습니다: id=%', p_account_id;
  END IF;

  IF current_balance < p_amount THEN
    RAISE EXCEPTION '잔액 부족: 현재잔액=%, 출금요청=%', current_balance, p_amount;
  END IF;

  UPDATE accounts
  SET balance = balance - p_amount
  WHERE id = p_account_id;
END;
$$;

-- 프로시저 4: 계좌 이체 (트랜잭션 활용)
CREATE OR REPLACE PROCEDURE transfer(
  p_from_id INT,
  p_to_id INT,
  p_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION '이체 금액은 0보다 커야 합니다: %', p_amount;
  END IF;

  CALL withdraw(p_from_id, p_amount);
  CALL deposit(p_to_id, p_amount);
END;
$$;

-- 함수: 잔액 조회 (RETURN 값이 필요할 때는 FUNCTION 사용)
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

  IF NOT FOUND THEN
    RAISE EXCEPTION '계좌를 찾을 수 없습니다: id=%', p_account_id;
  END IF;

  RETURN current_balance;
END;
$$;
