# k6 부하 테스트 가이드

이 저장소의 k6 시나리오는 “부팅 직후 동일 burst”를 재현하는 데 맞춰져 있다. 예전처럼 `cold` 요청 몇 개를 먼저 보내면 그 자체가 앱을 데워서 실험이 흐려진다. 그래서 현재 스크립트는 사전 요청 없이 바로 `/products/search`에 짧은 burst를 건다.

## 실행

웜업 없는 앱:

```bash
make restart-no-warmup
make load-no-warmup
```

웜업 있는 앱:

```bash
make restart-with-warmup
make load-with-warmup
```

`load-with-warmup`은 본 부하 전에 `/warmup/status`를 polling해서 warm-up 완료를 확인한다.

## 왜 burst만 보나

이 실습의 목적은 steady-state 성능이 아니라 “부팅 직후 첫 수초”다. 그래서 시나리오는 아래처럼 짧다.

- 3초 ramp-up
- 12초 유지
- 3초 ramp-down

이 구간에서 `usage time`이 먼저 오르고, 그 결과 `acquire time`이 따라오는지 보는 것이 핵심이다.

## 같이 볼 지표

- API latency max / p95
- `hikaricp_connections_usage_seconds`
- `hikaricp_connections_pending`
- `hikaricp_connections_acquire_seconds`

threshold 실패는 실험의 실패가 아니다. 오히려 `no-warmup`에서만 초기 threshold가 깨진다면, 부팅 직후 경로가 충분히 차이를 만들고 있다는 뜻일 수 있다.
