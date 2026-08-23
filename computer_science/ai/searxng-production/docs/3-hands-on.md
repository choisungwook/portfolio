# 인증, HA, 봇 탐지 재현

[실습 환경](./2-setup.md)을 먼저 실행한다. 로컬 계정은 `lab`, 비밀번호는 `production-lab`이다.

## 인증 경계 확인

인증 없이 요청하면 gateway가 SearXNG에 전달하기 전에 거절한다.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8088/
```

- 기대 결과: `401`

Basic Auth를 통과한 요청만 SearXNG에 도달한다.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -u lab:production-lab \
  -A 'Mozilla/5.0' \
  -H 'Accept: text/html' \
  http://localhost:8088/
```

- 기대 결과: `200`
- Basic Auth는 인증 경계를 관찰하기 위한 로컬 대체물이다.
- 프로덕션에서는 OIDC, mTLS 또는 service JWT를 gateway에서 검증한다.

## SearXNG replica 분산 확인

응답의 `X-SearXNG-Upstream`은 요청을 처리한 container 주소다.

```bash
for i in 1 2 3 4; do
  curl -sSI \
    -u lab:production-lab \
    -A 'Mozilla/5.0' \
    -H 'Accept: text/html' \
    http://localhost:8088/ \
    | awk -F': ' 'tolower($1) == "x-searxng-upstream" {print $2}'
done
```

- 두 주소가 번갈아 나오면 gateway가 두 replica에 분산한다.
- 이 구성의 gateway와 Valkey는 단일 container이므로 프로덕션 HA 구성이 아니다.

## 사용자 요청을 봇으로 판정시키기

실습 순서를 독립적으로 만들기 위해 공유 limiter 상태를 비운다.

```bash
docker compose exec -T valkey valkey-cli FLUSHDB
```

JSON API는 기본 limiter에서 IP당 1시간에 4회까지 허용된다. 브라우저 형태의 header를 보내 rate 조건만 확인한다.

```bash
for i in 1 2 3 4 5 6; do
  curl -sS --compressed -o /dev/null -w "$i %{http_code}\n" \
    -u lab:production-lab \
    -A 'Mozilla/5.0' \
    -H 'Accept: text/html' \
    -H 'Accept-Language: en-US,en;q=0.9' \
    'http://localhost:8088/search?q=rate-limit&format=json&engines=mock%20success'
done
```

- 기대 결과: 처음 4개 요청은 `200`, 이후 요청은 `429`
- `200`은 검색 엔진 성공을 뜻하지 않는다. SearXNG가 검색 엔진 오류를 JSON 응답에 담을 수 있다.
- `curl` User-Agent, `text/html`이 없는 `Accept`, 압축을 지원하지 않는 `Accept-Encoding`, 비어 있는 `Accept-Language`도 header probe의 봇 판정 조건이다.

## SearXNG가 검색 엔진에서 차단되는 상황 만들기

실제 검색 엔진에 부하를 주지 않고 `mock-engine`이 항상 `429`를 반환하게 했다. limiter 상태를 비운 뒤 mock engine만 지정한다.

```bash
docker compose exec -T valkey valkey-cli FLUSHDB
curl -sS --compressed \
  -u lab:production-lab \
  -A 'Mozilla/5.0' \
  -H 'Accept: text/html' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  'http://localhost:8088/search?q=origin-block&format=json&engines=mock%20upstream'
```

- HTTP 응답 자체는 `200`일 수 있다.
- `results`는 비고 `unresponsive_engines`에 `Too many requests`가 남는다.
- 해당 SearXNG replica는 `settings.yml`의 `SearxEngineTooManyRequests` 시간 동안 engine을 suspend한다.
- replica 2개는 같은 시점에 독립적으로 차단을 학습할 수 있다. 공유 Valkey는 inbound limiter 상태를 공유하는 용도다.

전체 검증은 한 명령으로 실행한다.

```bash
make verify
```
