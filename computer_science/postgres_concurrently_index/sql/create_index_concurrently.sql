-- 논블로킹 버전. ShareUpdateExclusiveLock만 잡아서 DML과 공존한다.
-- 트랜잭션 블록 안에서는 실행할 수 없다. psql에서 직접 실행하거나,
-- 별도 statement로 넘겨야 한다.

CREATE INDEX CONCURRENTLY idx_orders_customer_id_concurrent
    ON orders (customer_id);
