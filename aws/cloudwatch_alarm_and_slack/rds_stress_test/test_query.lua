function event(thread_id)
  -- c 필드를 조회해서 where 값을 수정하세요.
  local query = "SELECT * FROM sbtest1 WHERE c = '45575584051-98066223638-50505155169-83257674849-92578957352-29933207560-84271372173-53917929075-64247206072-28852761782';"
  db_query(query)
end
