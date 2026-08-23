# 검색 엔진을 Google과 Naver로 제한

외부 Origin은 Google과 Naver만 사용한다. 로컬 `mock success`, `mock upstream`은 `lab` category에 남겨 장애 재현 테스트에만 사용한다.

## 설정

`searxng/settings.yml`에서 upstream 기본 엔진을 두 개만 유지한다.

```yaml
use_default_settings:
  engines:
    keep_only:
      - google
      - naver

engines:
  - name: google
    inactive: false

  - name: naver
    disabled: false
```

- `keep_only`: upstream 기본 엔진 목록에서 Google과 Naver 외의 엔진을 제거한다.
- `google.inactive: false`: upstream에서 inactive인 Google engine을 registry에 포함한다.
- `naver.disabled: false`: upstream에서 기본 비활성화된 Naver engine을 기본 검색에 포함한다.
- `keep_only` 뒤에 선언한 custom mock engine은 제거되지 않는다.
- mock engine의 category는 `lab`이므로 일반 `general` 검색에는 참여하지 않는다.

Google Images, Google News, Naver Images, Naver News처럼 이름이 다른 engine은 포함하지 않는다. 현재 범위는 두 engine의 일반 web 검색이다.

## 재배포

설정 디렉터리는 read-only bind mount다. 파일 변경은 container 안에 보이지만 SearXNG process가 자동으로 reload하지 않으므로 container를 재생성한다.

```bash
docker compose up -d --force-recreate --wait
```

전체 서비스를 내리지 않고 SearXNG와 gateway만 재생성하려면 다음 순서로 실행한다.

```bash
docker compose up -d --force-recreate --wait searxng-a searxng-b
docker compose up -d --force-recreate --wait gateway
```

gateway도 재생성해 새 SearXNG container 주소를 다시 resolve한다.

## 검증

일반 검색에 참여하는 engine 설정을 확인한다.

```bash
curl -sS \
  -u lab:production-lab \
  -A 'Mozilla/5.0' \
  http://localhost:8088/config \
  | jq -r '.engines[] | select(.enabled and (.categories | index("general"))) | .name'
```

출력은 `google`, `naver` 두 개여야 한다. `mock success`, `mock upstream`은 registry에는 있지만 `general` category가 아니므로 명시적으로 engine을 선택한 실습에서만 사용한다.

JSON 검색 결과에서 실제 응답 engine을 확인한다.

```bash
curl -sS --compressed \
  -u lab:production-lab \
  -A 'Mozilla/5.0' \
  -H 'Accept: text/html,application/json' \
  -H 'Accept-Language: ko-KR,ko;q=0.9' \
  'http://localhost:8088/search?q=SearXNG&format=json&language=ko-KR' \
  | jq '{engines: [.results[].engine] | unique, unresponsive_engines}'
```

실제 Origin 요청은 낮은 빈도로 실행한다. 반복 검증은 [검색 테스트 시나리오](./search-test-scenarios.md)의 mock 테스트를 우선한다.

## 참고자료

- [SearXNG settings.yml과 keep_only](https://docs.searxng.org/admin/settings/settings.html#use-default-settings)
- [SearXNG engine settings](https://docs.searxng.org/admin/settings/settings_engines.html)
- [Configured Engines](https://docs.searxng.org/user/configured_engines.html)
