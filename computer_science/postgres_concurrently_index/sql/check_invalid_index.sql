-- CONCURRENTLY 생성이 실패한 뒤 남은 invalid 인덱스를 찾는다.
-- indisvalid=false면 플래너가 사용하지 않지만, DML에는 여전히 반영되기 때문에 운영에 해롭다.

SELECT
  t.relname     AS table_name,
  c.relname     AS index_name,
  i.indisvalid,
  i.indisready,
  pg_size_pretty(pg_relation_size(c.oid)) AS index_size
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_class t ON t.oid = i.indrelid
WHERE NOT i.indisvalid
ORDER BY t.relname;
