CREATE TABLE IF NOT EXISTS products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    price INT NOT NULL,
    UNIQUE KEY uk_name (name)
);

-- 로컬에서도 cold-start 시 차이를 관찰할 수 있도록 카테고리별로 충분한 읽기 데이터를 만든다.
-- 이름을 deterministic 하게 생성하므로 INSERT IGNORE로 두 앱이 동시에 올라와도 안전하다.
INSERT IGNORE INTO products (name, category, price)
SELECT
    CONCAT(category_seed.category, '-', LPAD(seed_rows.seed_no, 4, '0')) AS name,
    category_seed.category,
    category_seed.base_price + MOD(seed_rows.seed_no * category_seed.price_step, category_seed.price_window) AS price
FROM (
    SELECT ones.n + tens.n * 10 + hundreds.n * 100 + thousands.n * 1000 + 1 AS seed_no
    FROM (
        SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
    ) ones
    CROSS JOIN (
        SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
    ) tens
    CROSS JOIN (
        SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
    ) hundreds
    CROSS JOIN (
        SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2
    ) thousands
) seed_rows
CROSS JOIN (
    SELECT 'electronics' AS category, 50000 AS base_price, 7919 AS price_step, 1800000 AS price_window
    UNION ALL SELECT 'books', 7000, 811, 90000
    UNION ALL SELECT 'clothing', 12000, 3571, 250000
    UNION ALL SELECT 'furniture', 80000, 12347, 1900000
    UNION ALL SELECT 'food', 2000, 149, 90000
    UNION ALL SELECT 'beauty', 5000, 911, 300000
) category_seed
WHERE seed_rows.seed_no <= 2000;
