-- 쿼리 예시
function event(thread_id)
  local query = "SELECT * FROM users WHERE username = 'user" .. math.random(1, 1000000) .. "';" -- 데이터 범위에 맞게 수정
  -- 예: status로 조회하는 쿼리
  -- local query = "SELECT count(*) FROM users WHERE status = 'active';"
  db_query(query)
end
