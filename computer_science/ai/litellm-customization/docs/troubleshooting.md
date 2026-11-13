# Troubleshooting

실습 중 실제로 겪은 문제와 해결 방법이다.

## Proxy가 `prisma CLI is neither on PATH nor importable` 로그를 남기고 DB를 붙이지 않음

- 증상: `DATABASE_URL`을 설정하고 띄웠는데 `a database URL is set but the prisma CLI is neither on PATH nor importable as a package`가 나온다.
- 원인: `litellm[proxy]` extra에는 `prisma` 패키지가 없다. PyPI 메타데이터에서 `prisma`는 `extra-proxy` extra에 들어 있다.
- 해결: `prisma`만 직접 의존성으로 추가했다(`uv add 'prisma>=0.11,<1.0'`). `extra-proxy` 전체는 이 핸즈온에 필요 없는 의존성이 많아 쓰지 않았다.

## `Unable to find Prisma binaries. Please run 'prisma generate' first.`

- 증상: prisma를 설치한 뒤 기동하면 `Application startup failed`로 끝난다.
- 해결: LiteLLM 패키지 안의 schema로 client를 생성한다.

```bash
uv run prisma generate --schema .venv/lib/python3.*/site-packages/litellm/proxy/schema.prisma
```

## 테스트에서 두 번째로 등록한 콜백이 호출되지 않음

- 증상: 테스트마다 `litellm.callbacks = [새 recorder]`로 바꾸면 첫 테스트만 기록되고 다음 테스트의 recorder는 비어 있다.
- 해결: 모듈 수준에서 recorder 하나만 등록하고 테스트마다 기록만 비운다([tests/test_2_router.py](../tests/test_2_router.py)). 원인 코드는 추적하지 않았다.

## 한글 문장에서 이메일·전화번호 마스킹이 틀림

- 증상: `owner@example.com입니다.`가 `[email]`로 바뀌며 "입니다."가 사라지고, `010-1234-5678로`는 가려지지 않는다.
- 원인: Python `re`의 `\w`와 `\b`가 한글을 단어 문자로 본다.
- 해결: 이메일은 ASCII 문자 집합으로, 전화번호는 `(?<!\d)`, `(?!\d)` lookaround로 바꿨다. 자세한 내용은 [12-observability.md](12-observability.md#실습에서-걸린-함정-한글과-정규식-경계).

## Proxy 기동 직후 `/v1/search/searxng-primary`가 `Search tool ... not found` 반환

- 증상: `config/9-search-code.yaml`로 띄운 직후 한 번 `Search tool 'searxng-primary' not found in router.search_tools`(500)가 나왔다.
- 상태: 같은 순서로 세 번 다시 실행했지만 재현되지 않았고, 이후 `/v1/search/tools`에는 두 도구가 모두 보였다. liveness가 응답한 뒤 search tools 등록이 끝나기 전의 짧은 구간으로 추정하지만 확인하지 않았다. 기동 직후 실패하면 몇 초 뒤 다시 호출한다.
