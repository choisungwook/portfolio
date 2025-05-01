function event(thread_id)
  -- c 필드를 조회해서 where 값을 수정하세요.
  local query = "SELECT * FROM sbtest1 WHERE c = '48390703010-86598864691-64637430453-07798453484-65476315040-54917348605-67647960754-09421474354-95135043463-63332944892'"
  -- local query = "select * from sbtest1 where k = '4992833';"
  db_query(query)
end
