# 검색 테스트 시나리오

검색 테스트는 기능, 한국어 품질, 제한 정책, 장애 대응을 분리한다. 실제 Google과 Naver에는 낮은 빈도의 smoke test만 실행하고 반복·부하 테스트는 mock engine을 사용한다.

## 공통 판정 항목

- HTTP status
- 검색 latency
- 결과 개수
- 결과를 반환한 engine
- `unresponsive_engines`
- CAPTCHA, `403`, `429`
- 한국어 제목과 snippet 깨짐 여부
- 중복 URL 비율

HTTP `200`만으로 성공 처리하지 않는다. 최소 결과 개수와 engine별 오류를 함께 판정한다.

## 기능 테스트

| 시나리오 | 입력 | 기대 결과 |
| --- | --- | --- |
| 인증 없음 | `/search?q=test` | gateway `401` |
| HTML 검색 | `q=SearXNG`, `language=ko-KR` | `200`, HTML 결과 표시 |
| JSON 검색 | `q=SearXNG`, `format=json` | `200`, JSON schema와 결과 확인 |
| Engine 제한 | 일반 web 검색 | 외부 engine은 Google과 Naver만 사용 |
| Engine 직접 선택 | `engines=google` 또는 `engines=naver` | 선택한 engine만 결과 반환 |
| 잘못된 engine | 존재하지 않는 engine 지정 | 정상 결과로 오인하지 않고 오류 확인 |
| Paging | `pageno=2` | 1페이지와 다른 결과, 중복률 확인 |
| Timeout | mock에서 지연 응답 | timeout과 `unresponsive_engines` 확인 |
| Origin `429` | `mock upstream` | 전체 응답과 engine 오류를 분리해 확인 |

## 한국어 검색 품질

고정된 query set과 기대 domain 또는 topic을 version 관리한다.

| 유형 | 예시 | 확인 항목 |
| --- | --- | --- |
| 일반 한국어 | `서울 지하철 노선도` | 한국어 결과와 국내 domain 비중 |
| 공공 정보 | `site:go.kr 주민등록등본 발급` | 공식 공공기관 domain 상위 노출 |
| 기술 용어 | `쿠버네티스 인그레스 설정` | 한글·영문 혼합 query 처리 |
| 띄어쓰기 | `근로 장려금 신청` | 띄어쓰기 차이에 따른 품질 |
| 오탈자 | 사전에 정한 경미한 오탈자 | suggestion 또는 유효 결과 |
| 고유명사 | `경복궁 관람 시간` | 국내 장소 정보의 관련성 |
| 최신성 | 날짜가 포함된 공개 보도자료 | `time_range`와 최신 결과 확인 |
| 영문 query | `SearXNG limiter` | 한국 locale에서도 영문 결과 확인 |

뉴스, 날씨, 환율처럼 값이 변하는 query는 결과 문자열 전체를 assertion으로 사용하지 않는다. 공식 domain 포함 여부, 결과 존재, 날짜 범위로 판정한다.

## Locale 테스트

같은 query를 다음 조건으로 비교한다.

- `language=ko-KR`
- `language=ko`
- `language=en-US`
- `Accept-Language: ko-KR,ko;q=0.9`
- language parameter와 `Accept-Language`가 모두 없음

Google은 언어와 지역에 따라 결과와 domain이 달라질 수 있다. Naver는 한국어 전용이므로 locale 변화에 같은 방식으로 반응하지 않는다.

## Limiter 테스트

외부 Origin을 호출하지 않고 `mock success`를 지정한다.

- HTML burst: 20초 안에 16번째 요청이 `429`인지 확인한다.
- HTML long window: 10분 안에 151번째 요청이 `429`인지 확인한다.
- JSON API: 1시간 안에 5번째 요청이 `429`인지 확인한다.
- 두 replica 교차 호출: 공유 Valkey에서 합산되는지 확인한다.
- 서로 다른 client IP: `X-Forwarded-For`별 counter가 분리되는지 확인한다.
- 잘못된 header: bot header probe가 `429`를 반환하는지 확인한다.

실습 시작 전 `FLUSHDB`는 local Valkey에서만 실행한다. 프로덕션 Valkey에는 실행하지 않는다.

## 검색하면 안 되는 내용 테스트

현재 SearXNG 구성은 query 자체를 금지하지 않는다. `safe_search`도 Origin이 지원하는 결과 필터일 뿐 query 차단 기능이 아니다.

조직 정책상 금지 검색이 있다면 먼저 gateway에 명시적인 정책을 구현하고 다음을 테스트한다.

| 정책 유형 | 테스트 방식 | 기대 결과 |
| --- | --- | --- |
| 금칙어 | 실제 불법 자료명 대신 synthetic 금칙어 fixture 사용 | Origin 호출 전 `403` |
| 금지 domain | 내부 test domain을 block list에 등록 | 결과에서 제거되고 audit event 기록 |
| 성인물 | 통제된 fixture 결과에 policy label 부여 | strict 정책에서 결과 제거 |
| 개인정보 | 가짜 주민번호·가짜 email fixture 사용 | query log에 원문을 남기지 않고 차단 |
| 악성 URL | 무해한 test domain 또는 보안 vendor test URL 사용 | 클릭 전 차단 또는 경고 |

실제 아동 성착취물, 불법 개인정보, 악성코드 배포 URL을 검색하거나 수집하지 않는다. 차단 로직은 mock engine과 synthetic fixture로 검증한다.

SafeSearch smoke test가 필요하면 Google에서 `safesearch=0`과 `safesearch=2`의 결과 차이만 낮은 빈도로 확인한다. 특정 유해 결과가 반드시 사라진다는 assertion은 Origin 결과 변화 때문에 회귀 테스트로 사용하지 않는다.

## Origin smoke test

배포 직후 engine별로 대표 query 한 건씩 실행한다.

```bash
curl -sS --compressed \
  -u lab:production-lab \
  -A 'Mozilla/5.0' \
  -H 'Accept: text/html' \
  -H 'Accept-Language: ko-KR,ko;q=0.9' \
  'http://localhost:8088/search?q=서울%20지하철&format=json&language=ko-KR&engines=google' \
  | jq '{result_count: (.results | length), unresponsive_engines}'
```

Naver smoke test는 `engines=naver`로 바꿔 한 번 더 실행한다. 자동화 주기를 짧게 두지 않고 engine별 budget에 포함한다.

## 배포 판정

- Google과 Naver 중 필수 engine이 최소 결과 기준을 충족한다.
- `unresponsive_engines`에 CAPTCHA, `403`, `429`가 없다.
- 한국어 query와 UTF-8 결과가 깨지지 않는다.
- limiter와 gateway 인증 테스트가 통과한다.
- 금지 검색 정책이 요구되면 synthetic policy test가 통과한다.

## 참고자료

- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html)
- [Configured Engines](https://docs.searxng.org/user/configured_engines.html)
- [SearXNG search settings](https://docs.searxng.org/admin/settings/settings_search.html)
