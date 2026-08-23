# 검색 엔진의 언어, 지역, 유해물 필터

SearXNG의 기본 검색 지역이 미국으로 고정되는 것은 아니다. 현재 `default_lang`이 비어 있어 browser의 `Accept-Language`를 사용하고, header가 없으면 `en`으로 fallback한다.

## 현재 locale 결정 순서

검색 locale은 먼저 발견한 값으로 결정한다.

1. 관리자가 lock한 language
2. query의 `:ko-KR` 같은 language prefix
3. 요청 parameter `language=ko-KR`
4. 사용자 preference cookie
5. browser의 `Accept-Language`
6. 인식할 header가 없으면 `en`

`en` fallback은 미국 지역을 강제한다는 뜻이 아니다. 언어만 영어로 지정하고 국가 code가 없으므로 Origin은 SearXNG의 NAT Gateway EIP 위치와 자체 정책을 추가로 사용할 수 있다.

## Google

Google engine은 SearXNG locale을 Google 요청 parameter와 domain으로 변환한다.

| SearXNG locale | Google 요청의 주요 효과 |
| --- | --- |
| `en` | 영어 결과 제한, 국가 제한 없음, 보통 `www.google.com` 사용 |
| `en-US` | 영어와 미국 지역을 지정 |
| `ko` | 한국어 결과 제한, 국가 제한 없음 |
| `ko-KR` | 한국어와 한국 지역을 지정하고 `www.google.co.kr` 사용 |
| `all` | 언어·국가 제한을 최소화하고 기본 Google domain 사용 |

Google은 locale 외에도 NAT Gateway EIP의 geolocation과 Origin의 정책에 따라 결과를 달리할 수 있다. 같은 `ko-KR` 요청도 Google 웹 UI와 결과가 완전히 같다고 보장할 수 없다.

## Naver

Naver engine은 `language = "ko"`로 고정된 한국어 전용 engine이다.

- 요청 대상은 `https://search.naver.com/search.naver`다.
- `language=ko-KR`을 별도 지역 parameter로 변환하지 않는다.
- SearXNG의 locale 지원 목록에서도 Naver는 locale 미지원으로 표시된다.
- Naver 결과의 지역·개인화는 Naver의 서버 정책에 따른다.

## 한국 사용자용 설정

모든 요청의 기본 locale을 한국으로 지정하려면 `settings.yml`에 다음 값을 추가한다.

```yaml
search:
  default_lang: ko-KR
```

사용자가 preference나 request parameter로 바꾸지 못하게 하려면 language도 lock한다.

```yaml
preferences:
  lock:
    - language
```

다국어 검색이 필요하면 lock하지 않고 client가 `language`를 명시하게 한다.

## SafeSearch와 유해물 차단

SearXNG의 `safe_search`는 중앙 콘텐츠 검사기가 아니다. 설정값을 지원하는 Origin에 전달하는 집계 옵션이다.

| 값 | 의미 |
| --- | --- |
| `0` | 필터 없음 |
| `1` | 보통 |
| `2` | 엄격 |

현재 local 설정에는 `safe_search`가 없으므로 upstream 기본값 `0`을 사용한다.

Google 일반 web engine은 SafeSearch를 지원한다. Naver 일반 web engine은 SearXNG의 SafeSearch 지원 대상으로 표시되지 않으므로 같은 보장을 할 수 없다.

엄격 모드를 기본값으로 지정하는 설정은 다음과 같다.

```yaml
search:
  safe_search: 2

preferences:
  lock:
    - safesearch
```

이 설정도 유해물 차단을 보장하지 않는다.

- Origin이 분류한 결과만 필터링한다.
- Naver처럼 해당 기능을 지원하지 않는 engine에는 적용되지 않는다.
- URL, snippet, 본문을 SearXNG가 자체 정책으로 분류하지 않는다.
- 불법정보, 개인정보, 사내 금칙어, 악성코드 URL 같은 조직별 정책을 처리하지 않는다.

강제 차단이 요구되면 gateway의 query 정책, 결과 URL allow/block list, 별도 콘텐츠 분류기를 사용한다. Naver 결과까지 같은 SafeSearch 수준이 필수라면 Naver를 제외하거나 별도 필터를 둔다.

## 참고자료

- [SearXNG search settings](https://docs.searxng.org/admin/settings/settings_search.html)
- [SearXNG engine settings](https://docs.searxng.org/admin/settings/settings_engines.html)
- [Configured Engines](https://docs.searxng.org/user/configured_engines.html)
- [Google engine locale 처리](https://docs.searxng.org/dev/engines/online/google.html)
