-- V1: 상품(products) 테이블 생성 및 초기 데이터 입력
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price INTEGER NOT NULL
);

INSERT INTO products (name, price)
VALUES
    ('Mechanical Keyboard', 120000),
    ('USB-C Hub', 45000);
