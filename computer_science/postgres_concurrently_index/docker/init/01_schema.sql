-- 실습용 orders 테이블과 200만 건의 더미 데이터를 만든다.
-- customer_id에 인덱스가 없기 때문에 WHERE customer_id = ? 쿼리가 seq scan을 탄다.
-- 이후 실습에서 이 컬럼에 인덱스를 만들면서 블로킹/논블로킹 차이를 관찰한다.

CREATE TABLE orders (
  id           BIGSERIAL PRIMARY KEY,
  customer_id  BIGINT      NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending',
  amount       NUMERIC(12, 2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 200만 건 시드. t4g.small 수준에서 약 10~20초 소요.
INSERT INTO orders (customer_id, status, amount)
SELECT
  (random() * 100000)::BIGINT,
  CASE (random() * 3)::INT
    WHEN 0 THEN 'pending'
    WHEN 1 THEN 'paid'
    ELSE 'shipped'
  END,
  (random() * 10000)::NUMERIC(12, 2)
FROM generate_series(1, 2000000);

ANALYZE orders;
