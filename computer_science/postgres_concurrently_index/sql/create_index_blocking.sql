-- 블로킹 버전. ShareLock을 잡기 때문에 INSERT/UPDATE/DELETE가 전부 대기한다.
-- 실습에서 이 쿼리를 실행하는 동안 blocking_writer.sql의 UPDATE가 멈추는 것을 확인한다.

CREATE INDEX idx_orders_customer_id_blocking
    ON orders (customer_id);
