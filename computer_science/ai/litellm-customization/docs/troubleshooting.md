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

## complexity_router의 한글 키워드 규칙이 걸리지 않음

- 증상: `keyword_tier_rules`에 `데드락`을 넣었는데 "데드락이 나는 원인"이 그 tier로 가지 않는다.
- 원인: LiteLLM 1.109.1의 키워드 비교는 CJK 문자가 든 키워드만 부분 문자열로 비교하고, 그 판정 정규식에 한글이 없다. 한글 키워드는 단어 경계(`\b`)로 비교되어 조사가 붙으면 일치하지 않는다.
- 해결: 조사가 붙은 형태까지 나열하거나, 공백이 든 구로 쓰거나, `semantic_keyword_matching`을 켠다. 자세한 내용은 [6-complexity-router.md](6-complexity-router.md).

## complexity_router가 LLM 분류기를 부르지 않고 휴리스틱으로만 정함

- 증상: `classifier_type: llm`인데 응답 헤더 `x-litellm-complexity-router-cause`가 계속 `heuristic_scorer`다.
- 원인: CPU 전용 판정이 `timeout_ms` 기본값(3000)을 넘겨 한 번 실패하면 circuit이 열리고, `circuit_breaker_cooldown_seconds`(기본 30초) 동안 분류기를 부르지 않는다. Proxy 로그에 `LLM classifier circuit is open`이 남는다.
- 해결: `classifier_llm_config.timeout_ms`를 판정 시간보다 길게 둔다. 이 실습은 30000으로 두었다.
