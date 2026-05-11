-- 인덱스 생성 중 블로킹 여부를 관찰하기 위한 쓰기 워크로드.
-- psql의 \watch 메타 명령으로 매초 UPDATE를 반복한다.
-- \watch 는 각 실행을 별개의 autocommit 트랜잭션으로 돌리기 때문에
-- CONCURRENTLY의 "waiting for writers" 단계를 불필요하게 늘리지 않는다.
-- CREATE INDEX 실행 중에는 이 UPDATE가 블로킹되어 타이밍 간격이 벌어진다.
-- CREATE INDEX CONCURRENTLY 실행 중에는 계속 1초 간격으로 응답한다.

\timing on
UPDATE orders
   SET status = 'paid'
 WHERE id = (random() * 1999999 + 1)::BIGINT;
\watch 1
