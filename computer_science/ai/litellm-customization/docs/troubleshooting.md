# Troubleshooting

실습 과정에서 실제로 발생한 문제와 해결 방법을 정리한다.

## Proxy가 `prisma CLI is neither on PATH nor importable` 로그를 남기며 DB를 연결하지 못함

- **증상**: `DATABASE_URL`을 설정하고 기동했으나 `a database URL is set but the prisma CLI is neither on PATH nor importable as a package` 로그가 출력되며 DB 연동이 실패한다.
- **원인**: `litellm[proxy]` extra에는 `prisma` 패키지가 포함되어 있지 않다. PyPI 메타데이터 기준으로 `prisma`는 `extra-proxy` extra에 속해 있다.
- **해결**: `prisma` 패키지만 직접 의존성으로 추가했다(`uv add 'prisma>=0.11,<1.0'`). `extra-proxy` 전체에는 이 핸즈온에 불필요한 의존성이 많아 선택하지 않았다.

## `Unable to find Prisma binaries. Please run 'prisma generate' first.` 오류 발생

- **증상**: `prisma` 패키지를 설치한 뒤 Proxy를 기동하면 위 오류와 함께 `Application startup failed`로 종료된다.
- **해결**: LiteLLM 패키지 내부에 포함된 schema 파일을 지정해 Prisma client를 생성한다.

```bash
uv run prisma generate --schema .venv/lib/python3.*/site-packages/litellm/proxy/schema.prisma
```

## 테스트에서 두 번째로 등록한 콜백이 호출되지 않음

- **증상**: 테스트 함수마다 `litellm.callbacks = [새 recorder]` 형태로 교체하면 첫 번째 테스트만 기록되고 이후 테스트의 recorder는 비어 있다.
- **해결**: 모듈 수준에서 recorder 인스턴스 하나만 등록해 두고 테스트마다 내부 기록 리스트만 초기화하는 방식으로 우회했다([tests/test_2_router.py](../tests/test_2_router.py)). 정확한 내부 원인까지는 추적하지 않았다.

## `complexity_router`의 한글 키워드 규칙이 매칭되지 않음

- **증상**: `keyword_tier_rules`에 `"데드락"`을 등록했으나 `"데드락이 나는 원인"` 같은 질문이 해당 tier로 분류되지 않는다.
- **원인**: LiteLLM 1.109.1의 키워드 비교 로직은 CJK 문자가 포함된 키워드만 부분 문자열로 매칭하며, CJK 판정 정규식에 한글이 포함되어 있지 않다. 그 결과 한글 키워드는 단어 경계(`\b`) 기준으로 비교되어 조사가 붙은 단어와 일치하지 않는다.
- **해결**: 조사가 결합된 형태를 함께 나열하거나, 공백이 포함된 구(phrase)로 등록하거나, 임베딩 기반 매칭(`semantic_keyword_matching`)을 활성화한다. 자세한 내용은 [6-complexity-router.md](6-complexity-router.md)를 참고한다.

## `complexity_router`가 LLM 분류기를 호출하지 않고 휴리스틱으로만 동작함

- **증상**: `classifier_type: llm`으로 설정했는데도 응답 헤더 `x-litellm-complexity-router-cause`가 계속 `heuristic_scorer`로 반환된다.
- **원인**: CPU 전용 판정 시간이 `timeout_ms` 기본값(3000ms)을 초과해 한 번 실패하면 circuit breaker가 열리고, `circuit_breaker_cooldown_seconds`(기본 30초) 동안 LLM 분류기 호출을 건너뛴다. 이때 Proxy 로그에 `LLM classifier circuit is open` 경고가 남는다.
- **해결**: `classifier_llm_config.timeout_ms`를 실제 판정 소요 시간보다 길게 설정한다. 이 실습에서는 `30000`으로 설정했다.
