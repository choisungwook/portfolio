-- orders 테이블에 대해 락을 잡고 있거나 기다리는 세션을 조회한다.
-- 블로킹 시나리오에서는 UPDATE 세션들이 granted=false 상태로 대기한다.

SELECT
  l.pid,
  l.mode,
  l.granted,
  l.locktype,
  now() - a.query_start AS wait_time,
  a.state,
  LEFT(a.query, 80) AS query
FROM pg_locks l
JOIN pg_stat_activity a USING (pid)
WHERE l.relation = 'orders'::regclass
ORDER BY l.granted ASC, a.query_start ASC;
