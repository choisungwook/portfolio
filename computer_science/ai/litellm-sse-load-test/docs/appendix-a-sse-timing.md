# 부록 A. SSE 헤더와 첫 이벤트의 시차 확인

[2.3의 모델 호출](2.3-sse-vs-http.md)에서는 헤더와 첫 텍스트가 거의 동시에 올 수 있습니다. 간격을 눈으로 확인하려면 첫 텍스트 준비 시간을 2초로 정한 로컬 서버를 사용합니다. 첫 터미널에서 실습 디렉터리로 이동해 서버를 시작합니다. [헤더 전송 코드](../scripts/sse_timing_demo.py#L19-L23) · [이벤트 전송 코드](../scripts/sse_timing_demo.py#L25-L29)

```bash
uv run scripts/sse_timing_demo.py
```

두 번째 터미널에서 GET 한 건을 보냅니다. `-i -N`은 헤더와 스트리밍 본문을 터미널에 함께 보여 주고, `--trace-time`은 curl이 받은 시각을 기록합니다. 원본 응답을 저장해 다음 단계에서도 같은 요청의 본문을 읽습니다.

```bash
trace_file=$(mktemp)
response_file=$(mktemp)
curl -sS -i -N --max-time 10 \
  --trace-time --trace-ascii "$trace_file" \
  http://127.0.0.1:8008/events | tee "$response_file"
```

먼저 `200 OK`와 `text/event-stream`이 보이고, 약 2초 뒤에 `hello`와 `world`가 같은 이벤트로 도착합니다. 그 후 `next`, `last`가 약 0.5초 간격으로 옵니다. 서버는 마지막 이벤트 뒤에 연결을 닫습니다.

curl 추적에서 상태 줄과 데이터 수신 시각만 뽑아 간격을 확인합니다.

```bash
awk '
  /Recv header/ && !header { print; getline; print; header=1 }
  /Recv data, [1-9]/ { print; getline; print }
' "$trace_file"
```

로컬 실행에서는 첫 본문 수신이 상태 줄 수신보다 약 2.01초 늦었고, 후속 수신은 각각 약 0.50초 간격이었습니다. 아래 출력에서 `hello`와 `world`는 같은 수신 기록에 들어 있습니다. 이벤트 경계는 추적에 찍힌 수신 단위와 별개로 원본 본문의 빈 줄에서 확인합니다.

```text
14:27:39.390900 <= Recv header, 17 bytes (0x11)
0000: HTTP/1.1 200 OK
14:27:41.396169 <= Recv data, 25 bytes (0x19)
0000: data: hello.data: world..
14:27:41.898893 <= Recv data, 12 bytes (0xc)
0000: data: next..
14:27:42.400913 <= Recv data, 12 bytes (0xc)
0000: data: last..
```

저장한 응답에서 `data:` 줄을 모으고 빈 줄마다 한 이벤트로 표시합니다. 이 awk 코드는 위 샘플의 `data:`와 빈 줄을 해석합니다.

```bash
awk '
  /^data: / {
    data = lines ? data "\n" substr($0, 7) : substr($0, 7)
    lines++
  }
  /^$/ && lines {
    printf "event %d:\n%s\n", ++event, data
    lines=0
  }
' "$response_file"
```

`event 1` 아래에 `hello`와 `world`가 줄바꿈을 사이에 두고 함께 표시됩니다. `next`와 `last`는 각각 별도 이벤트입니다. 확인을 마치면 첫 터미널에서 Ctrl+C로 서버를 종료합니다.

[2.3 응답 비교 그림의 생성 프롬프트](../imgs/http-vs-sse-timeline-prompt.md)
