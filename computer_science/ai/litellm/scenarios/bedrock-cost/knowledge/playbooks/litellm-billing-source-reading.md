---
type: Playbook
title: LiteLLM 과금 로직은 컨테이너 안 소스로 확인한다
description: 과금 결과가 예상과 다르면 실행 중인 컨테이너의 site-packages에서 과금 경로 네 파일을 읽는다.
tags: [litellm, cost, debugging]
timestamp: 2026-09-20T00:00:00Z
---

# LiteLLM 과금 로직은 컨테이너 안 소스로 확인한다

문서와 릴리스 노트는 버전과 어긋나지만 컨테이너 안 소스는 지금 도는 코드 그 자체다.

패키지 경로를 잡는다.

```bash
docker compose exec litellm python -c "import litellm, os; print(os.path.dirname(litellm.__file__))"
```

아래 순서로 읽는다.

| 파일 | 답하는 질문 |
|---|---|
| `cost_calculator.py` | 토큰 수와 단가가 어떻게 곱해지는가 |
| `router.py`의 `_register_deployment_in_model_cost` | custom pricing이 기본 가격표와 어떻게 합쳐지는가 |
| `proxy/db/db_spend_update_writer.py` | spend가 어떤 값으로 DB에 쓰이는가 |
| `proxy/spend_tracking/savings.py` | 캐시 절감액이 어떻게 계산되는가 |

읽은 결론은 `/model/info`나 실제 호출 한 건으로 다시 확인한다.

- 경로는 v1.99.1 기준이다. 파일이 없으면 위 질문으로 grep한다.
- 이미지에 `curl`이 없으므로 컨테이너 안에서 HTTP를 찌를 때는 python을 쓴다.
