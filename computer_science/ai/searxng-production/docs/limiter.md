# SearXNG limiter 설정

이 구성의 limiter는 클라이언트 요청을 IP 단위로 제한한다. 외부 검색 엔진의 차단을 직접 해제하지는 않지만, 과도한 요청이 Google과 Naver로 전달되는 것을 줄인다.

## 인증과 limiter

Origin 보호 관점에서는 limiter가 핵심이다. 인증된 사용자도 과도한 검색을 만들 수 있으므로 인증만으로 Google과 Naver의 차단을 예방할 수 없다.

- 인증: 허용된 사용자와 service만 SearXNG에 접근하게 한다.
- Gateway quota: 사용자·tenant·service별 사용량을 제한한다.
- SearXNG limiter: client IP별 비정상 요청을 마지막 단계에서 제한한다.
- Origin budget: NAT Gateway EIP별 Google·Naver 요청량과 오류율을 관리한다.

Private 프로덕션에서는 네 가지를 함께 사용한다. Limiter가 중요하다는 이유로 인증을 제거하면 익명 사용자가 제한 범위까지 Origin budget을 계속 소비할 수 있다.

## 활성화 조건

`settings.yml`에서 limiter와 Valkey 연결을 활성화한다.

```yaml
server:
  limiter: true

valkey:
  url: valkey://valkey:6379/0
```

- `server.limiter`: SearXNG의 요청 전처리 단계에서 봇 탐지를 실행한다.
- `valkey.url`: replica가 공유할 IP별 sliding window를 저장한다.
- 둘 중 하나가 빠지면 rate limit이 정상 동작하지 않는다.

## 현재 `limiter.toml`

현재 파일에 명시한 값은 다음과 같다.

```toml
[botdetection]
trusted_proxies = ["172.28.240.0/24"]

[botdetection.ip_limit]
filter_link_local = true
link_token = false

[botdetection.ip_lists]
pass_searxng_org = false
```

로컬 파일에 없는 값은 SearXNG 이미지의 기본 `limiter.toml`과 소스 코드 값을 상속한다.

| 설정 | 현재 값 | 의미 |
| --- | --- | --- |
| `trusted_proxies` | `172.28.240.0/24` | 이 Docker network에서 온 요청의 `X-Forwarded-For`를 신뢰한다. gateway가 전달한 실제 client IP를 limiter 기준으로 사용한다. |
| `filter_link_local` | `true` | link-local client 주소도 `ip_limit` 검사 대상에 포함한다. |
| `link_token` | `false` | 브라우저가 token이 포함된 CSS를 다시 요청했는지 검사하지 않는다. API client도 일반 rate limit으로 처리한다. |
| `pass_searxng_org` | `false` | `check.searx.space` 등 SearXNG 조직의 고정 pass list를 사용하지 않는다. private instance에 불필요한 예외를 만들지 않는다. |

`trusted_proxies`에는 실제 reverse proxy와 load balancer CIDR만 넣는다. 인터넷 전체나 VPC 전체를 신뢰하면 client가 위조한 `X-Forwarded-For`로 제한을 우회할 수 있다.

## 상속하는 기본값

현재 이미지 `2026.8.16-b2da6b90f`의 limiter 기본값이다. 이 임계값은 `limiter.toml`로 조정하는 항목이 아니라 SearXNG 소스 코드 상수다.

| 구간 | 정상 요청 한도 | `link_token` 사용 시 의심 요청 한도 |
| --- | --- | --- |
| 20초 burst | 15회 | 2회 |
| 10분 long window | 150회 | 10회 |
| 1시간 API 요청 | 4회 | 동일 |
| 30일 suspicious IP window | 사용하지 않음 | 3회 |

- API 요청은 `format`이 `html`이 아닌 JSON, CSV, RSS 요청이다.
- 한도를 초과한 요청부터 `429 Too Many Requests`를 반환한다.
- IPv4는 기본 `/32`, IPv6는 `/48` network 단위로 집계한다.
- 현재 `link_token=false`이므로 의심 요청용 2회, 10회, 30일 window는 사용하지 않는다.

## Header 검사

`/search` 요청은 rate limit 전에 HTTP header 검사도 통과해야 한다.

| Header | 봇으로 처리되는 대표 조건 |
| --- | --- |
| `User-Agent` | 값이 없거나 `curl`, `wget`, `python-requests`, `HeadlessChrome` 등 기본 bot 패턴과 일치 |
| `Accept` | `text/html`이 없음 |
| `Accept-Encoding` | 압축 지원 header가 브라우저 형태가 아님 |
| `Accept-Language` | 값이 없음 |
| `Sec-Fetch-*` | 지원 브라우저가 보낸 값이 유효하지 않음 |

Header 검사는 봇을 확정하는 정교한 판별기가 아니다. 일반 HTTP client도 브라우저 header를 보내지 않으면 차단될 수 있고, 봇도 header를 모방할 수 있다.

## 정상 사용자도 차단되는 조건

정상 사용자도 다음 조건에서는 SearXNG limiter의 `429`를 받을 수 있다.

- 같은 client IP에서 20초 동안 검색을 16회 이상 실행한다.
- 같은 client IP에서 10분 동안 검색을 151회 이상 실행한다.
- JSON API를 같은 client IP에서 1시간 동안 5회 이상 호출한다.
- 회사 NAT 뒤의 여러 사용자가 하나의 공인 IP로 보인다.
- gateway가 실제 client IP를 전달하지 않아 모든 사용자가 gateway IP로 합쳐진다.
- 브라우저가 아닌 사내 agent가 필수 header 없이 `/search`를 호출한다.

인증된 사용자도 같은 조건으로 차단된다. 인증은 신원 확인이고 limiter는 요청 속도 제한이므로 서로 대체하지 않는다.

## AWS NAT Gateway 구조

AWS NAT Gateway는 보통 SearXNG에서 Origin으로 나가는 요청에 영향을 준다.

```text
Client IP -> ALB 또는 gateway -> SearXNG -> NAT Gateway EIP -> Google 또는 Naver
```

- SearXNG limiter: gateway가 보존한 client IP를 본다.
- Google과 Naver: NAT Gateway의 EIP만 본다.
- 여러 사용자와 SearXNG replica의 요청이 Origin에서는 하나의 EIP 트래픽으로 합쳐진다.
- replica를 늘려도 NAT Gateway EIP가 같으면 Origin이 보는 source IP는 늘지 않는다.

ALB 또는 gateway가 `X-Forwarded-For`를 잘못 구성하면 inbound 요청도 하나의 proxy IP로 합쳐진다. NAT Gateway 자체는 inbound client IP를 결정하지 않는다.

## Origin별 차단 가능성

Google과 Naver의 정확한 anti-bot 임계값은 공개되어 있지 않다. 다음 조건은 공개된 고정 규칙이 아니라 운영 시 관찰해야 할 위험 신호다.

| Origin | SearXNG 구현 | 차단 위험이 커지는 조건 | 관찰 결과 |
| --- | --- | --- | --- |
| Google | 공식 API가 아닌 Google HTML 검색 결과를 파싱 | NAT EIP의 높은 요청량·동시성, 짧은 간격의 반복 query, datacenter IP 평판, cookie·HTTP fingerprint의 자동화 패턴 | CAPTCHA 또는 `/sorry` 응답, `403`, `429`, `unresponsive_engines` |
| Naver | 공식 API가 아닌 `search.naver.com` HTML을 파싱 | NAT EIP의 높은 요청량·동시성, 반복 query, datacenter IP 평판, 자동화된 요청 패턴 | `403`, `429`, 빈 결과, HTML 변경에 따른 parsing 실패 |

Google engine에는 CAPTCHA 응답을 식별하는 전용 처리가 있다. Naver engine에는 같은 형태의 전용 CAPTCHA detector가 없으므로 HTTP 오류, 빈 결과, parser 오류를 함께 감시한다.

SearXNG 응답이 `200`이어도 일부 Origin만 실패할 수 있다. JSON 응답의 `unresponsive_engines`, engine별 결과 수, `403`·`429` 로그를 함께 확인한다.

## 운영 기준

- Gateway에서 identity별 quota와 동시 검색 수를 제한한다.
- SearXNG limiter를 공통 IP 기반 마지막 방어선으로 유지한다.
- Google과 Naver의 요청량·성공률·CAPTCHA·`403`·`429`를 분리해 측정한다.
- NAT Gateway EIP별 전체 요청 budget을 정한다.
- 실제 Origin을 차단 상태로 만들기 위한 부하 테스트는 하지 않는다.
- 공식 API가 필요한 트래픽 규모라면 Google Custom Search JSON API나 Naver 검색 API 사용을 별도로 검토한다.

## 참고자료

- [SearXNG Limiter](https://docs.searxng.org/admin/searx.limiter.html)
- [SearXNG Bot Detection](https://docs.searxng.org/src/searx.botdetection.html)
- [Configured Engines](https://docs.searxng.org/user/configured_engines.html)
- [Google engine](https://docs.searxng.org/dev/engines/online/google.html)
