# JVM Warm-up 실습

이 실습은 부팅 직후 첫 burst에서 Hikari `usage` → `pending` → `acquire` 연쇄가 어떻게 생기는지 두 앱을 같은 `/products/search` 경로로 비교한다.

- `app-no-warmup` (`localhost:8081`): 첫 요청까지 lazy-load를 미루는 상태
- `app-with-warmup` (`localhost:8082`): 시작 직후 같은 경로를 self-HTTP로 먼저 쳐서 예열한 상태

## 준비

스택 전체를 올린다.

```bash
make up
```

두 앱이 떠 있는지 확인한다.

```bash
curl localhost:8081/health
curl localhost:8082/health
```

Grafana는 `http://localhost:3000`에서 연다.

## 1. no-warmup 측정

부팅 직후 상태를 재현한 뒤 burst를 건다.

```bash
make restart-no-warmup
make load-no-warmup
```

## 2. with-warmup 측정

동일하게 재시작하고 burst를 건다. `load-with-warmup`은 burst 전에 `/warmup/status`를 확인해 self-warmup 완료를 보장한다.

```bash
make restart-with-warmup
make load-with-warmup
```

## 3. Grafana에서 볼 것

아래 순서로 본다.

1. `API Latency Max` 또는 p95
2. `HikariCP - Connection Usage Time`
3. `HikariCP - Active / Idle / Pending`
4. `HikariCP - Connection Acquire Time`

`usage`가 먼저 오른다. 커넥션을 잡은 뒤 애플리케이션 안에서 시간이 더 쓰이고 있다는 뜻이다. 그 상태에서 burst가 들어오면 idle이 사라지고 `pending`, `acquire`가 뒤따른다.

## 4. 결과 판독

- no-warmup: burst 초기에 latency spike, 같은 시점 `usage time` 상승, 뒤따라 `pending` / `acquire time` 상승
- with-warmup: 같은 burst에서 초기 spike가 줄어든다. `usage time` 증가폭과 `acquire time` 모두 작다

이 실습이 보여주는 것은 "warmup이 Hikari 설정을 바꿨다"가 아니라 **"초기화 비용이 먼저 줄었고, 그 결과 acquire pressure가 줄었다"**는 흐름이다.

## 5. 클래스 레벨 분석

첫 요청에서 실제로 어떤 클래스가 lazy-load되는지까지 보려면 [`docs/debug-classloading.md`](./debug-classloading.md)를 참고한다.
