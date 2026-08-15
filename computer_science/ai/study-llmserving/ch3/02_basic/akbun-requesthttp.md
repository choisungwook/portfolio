# akbun-requesthttp로 API 테스트

## 목적

- `02_basic` API의 health check와 단일 생성 요청 확인
- 요청 저장, 응답 확인, scenario 기능 반복 사용
- 동시 요청 성능 측정은 `client_v1.py` 사용

## 준비

[akbun-requesthttp](../../../../../product/akbun-requesthttp/README.md) 데스크톱 앱과 `02_basic` 서비스를 실행한다.

서비스 실행 명령이다.

```bash
uv run python 02_basic/serving_v1.py
```

akbun-requesthttp 개발 버전 실행 명령이다.

```bash
cd product/akbun-requesthttp/workspace
npm install
npm start
```

## Health check

`Import curl`에 다음 요청을 붙여 넣고 저장한다.

```bash
curl -X GET 'http://localhost:8000/healthz' \
  -H 'Accept: application/json'
```

- 요청 이름: `ch3-02 health`
- 기대 status: `200`
- 기대 body: `"status":"ok"`

## Queue 상태

`Import curl`에 다음 요청을 붙여 넣고 저장한다.

```bash
curl -X GET 'http://localhost:8000/queue_state' \
  -H 'Accept: application/json'
```

- 요청 이름: `ch3-02 queue state`
- 기대 status: `200`
- 기대 body: `queued_tasks`

## 단일 생성 요청

`Import curl`에 다음 요청을 붙여 넣고 저장한다.

```bash
curl -X POST 'http://localhost:8000/basic_generate' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  --data '{"prompt":"Explain why client concurrency may not improve model throughput.","min_processing_seconds":15}'
```

- 요청 이름: `ch3-02 generate`
- 기대 status: `200`
- 기대 body: `generated_text`

## Scenario 테스트

1. `ch3-02 health` 요청 추가
2. 기대 status에 `200` 입력
3. body contains에 `"status":"ok"` 입력
4. `ch3-02 generate` 요청 추가
5. 기대 status에 `200` 입력
6. body contains에 `generated_text` 입력
7. scenario 실행 후 두 step의 `PASS` 확인

## 확인 항목

- curl import가 method, URL, header, JSON body를 올바르게 구성하는지 확인
- JSON 응답의 pretty print 확인
- 저장한 요청을 다시 열어 동일한 응답을 받는지 확인
- scenario의 status와 body assertion 결과 확인
