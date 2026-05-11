-- 현재 실행 중인 인덱스 생성의 진행 상황을 조회한다.
-- phase 컬럼으로 어느 단계인지, blocks_done/blocks_total로 진행률을 볼 수 있다.
-- 아무 행도 안 나오면 이미 끝났거나 아직 시작 전이다.

SELECT
  pid,
  now() - query_start AS elapsed,
  relid::regclass AS table_name,
  index_relid::regclass AS index_name,
  phase,
  blocks_done,
  blocks_total,
  ROUND(100.0 * blocks_done / NULLIF(blocks_total, 0), 2) AS progress_pct,
  tuples_done,
  tuples_total
FROM pg_stat_progress_create_index p
LEFT JOIN pg_stat_activity a USING (pid);
