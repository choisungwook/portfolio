#!/bin/bash
# Host side helper. Runs one request from the client while both routers capture,
# then prints what each router saw. Which router shows the reply is the answer
# to "where did the return traffic go".
set -u

DUR=6
FILTER='host 10.10.0.10 and host 10.20.0.10'

for c in ar-r1 ar-r2; do
  docker exec -d "$c" sh -c "timeout $DUR tcpdump -i any -nn -l '$FILTER' > /tmp/cap.txt 2>/dev/null"
done
sleep 1

echo "== request: client -> 10.20.0.10:8080 =="
if docker exec ar-client curl -s --max-time 4 http://10.20.0.10:8080/; then
  echo "result: OK"
else
  echo "result: FAILED (curl exit $?)"
fi

sleep 2
for c in ar-r1 ar-r2; do
  echo
  echo "== $c saw =="
  docker exec "$c" sh -c 'cat /tmp/cap.txt 2>/dev/null' | head -12
done
