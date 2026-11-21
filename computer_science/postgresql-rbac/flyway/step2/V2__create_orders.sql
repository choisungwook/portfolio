-- V2: 주문(orders) 테이블 생성
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    ordered_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO orders (product_id, quantity)
VALUES (1, 2);
