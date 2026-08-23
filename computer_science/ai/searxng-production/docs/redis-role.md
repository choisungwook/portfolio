# Valkey 역할

이 구성의 Valkey는 SearXNG limiter 상태 공유에만 사용한다. 검색 결과를 캐시하지 않는다.

## 이름

- 현재 SearXNG 설정 이름과 URL scheme은 `valkey`, `valkey://`다.
- `redis` 설정은 이전 호환용이며 deprecated 상태다.
- 파일명은 질문 범위와 기존 용어를 찾기 쉽도록 `redis-role.md`로 둔다.

## 현재 저장 데이터

| 데이터 | 현재 사용 | 설명 |
| --- | --- | --- |
| IP별 burst counter | 사용 | 20초 sliding window |
| IP별 long counter | 사용 | 10분 sliding window |
| IP별 API counter | 사용 | non-HTML 요청의 1시간 sliding window |
| Link token과 browser ping | 판정에 사용 안 함 | UI가 관련 key를 만들 수 있지만 `link_token=false`이므로 현재 rate limit 판정에는 사용하지 않음 |
| 검색 결과 | 사용 안 함 | 같은 query도 Google과 Naver에 다시 요청 |
| 사용자 session·인증 | 사용 안 함 | 인증은 gateway가 담당 |
| Origin engine suspend 상태 | 사용 안 함 | SearXNG process와 replica별 상태 |

Limiter key에는 원본 IP 대신 IP network에서 만든 hash가 사용된다. 두 SearXNG replica가 같은 Valkey DB를 사용하므로 어느 replica가 처리해도 요청 횟수가 합산된다.

## 검색 관련 cache

SearXNG는 일반 검색 결과를 Valkey에 저장하는 response cache를 제공하지 않는다.

- 일부 engine의 token·session 같은 내부 데이터는 `/var/cache/searxng`의 SQLite engine cache를 사용할 수 있다.
- favicon cache도 별도 SQLite cache다.
- 현재 활성화한 Google과 Naver의 일반 검색 결과는 이 cache에 저장되지 않는다.
- `searxng-a-cache`, `searxng-b-cache` volume은 replica별로 분리한다.

검색 결과 cache가 필요하면 gateway 앞단에 임의로 추가하지 않는다. 검색어가 민감정보일 수 있고, 사용자 locale·SafeSearch·engine 상태에 따라 결과가 달라져 cache key와 보존 정책을 별도로 설계해야 한다.

## 장애 영향

- Valkey 연결이 없으면 limiter가 설치되지 않는다.
- replica 간 rate limit 합산이 사라진다.
- 검색 결과 cache miss가 아니라 bot protection 장애로 취급한다.
- 프로덕션에서는 HA Valkey endpoint, 접근 제어, 암호화, memory와 latency 감시가 필요하다.

현재 Compose는 `--save 30 1`과 `valkey-data` volume으로 limiter 상태를 snapshot한다. 로컬 실습 편의를 위한 설정이며 프로덕션 HA를 제공하지 않는다.

## 전용 DB 원칙

- DB `0`은 limiter 전용으로 사용한다.
- 다른 application cache와 섞지 않는다.
- 운영 중 `FLUSHDB`를 실행하지 않는다.
- 실습의 limiter 초기화에서만 `FLUSHDB`를 사용한다.
- memory eviction으로 limiter key가 사라지지 않도록 별도 capacity를 정한다.

## 참고자료

- [SearXNG Valkey settings](https://docs.searxng.org/admin/settings/settings_valkey.html)
- [SearXNG Valkey library](https://docs.searxng.org/src/searx.valkeylib.html)
- [SearXNG Redis migration notice](https://docs.searxng.org/admin/settings/settings_redis.html)
