-- V3: 재고 로그(inventory_logs) 테이블 생성 및 products 테이블에 재고(stock) 컬럼 추가
-- 주의: products 소유자가 아닌 계정이 실행하면 두 번째 문장에서 실패하고,
-- PostgreSQL 트랜잭션 DDL 특성 덕분에 첫 번째 CREATE TABLE도 함께 롤백됩니다.
CREATE TABLE inventory_logs (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    delta INTEGER NOT NULL,
    logged_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 10;
