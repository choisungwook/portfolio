---
type: Decision
title: LiteLLM 1.109.1로 고정
description: 확장 지점 핸즈온은 PyPI 최신 stable인 1.109.1 하나로 고정하고 소스 경로를 그 버전 기준으로 적는다
tags: [litellm, version, uv]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-13T03:40:00Z }
sources:
  - id: osv
    resource: https://api.osv.dev/v1/query
    title: OSV PyPI litellm 1.109.1 조회 (2026-11-13)
  - id: ghsa
    resource: https://api.github.com/advisories?ecosystem=pip&affects=litellm@1.109.1
    title: GitHub Advisory litellm 1.109.1 조회 (2026-11-13)
  - id: pypi
    resource: https://pypi.org/pypi/litellm/json
    title: PyPI litellm 릴리스 목록 (2026-11-13 조회)
---

## 결정

`litellm[proxy]==1.109.1`을 `pyproject.toml`에 고정한다. 저장소 루트 `.gitignore`가 `uv.lock`을 제외하므로 고정은 이 한 줄이 맡고, 하위 의존성은 설치 시점의 최신을 받는다. 문서의 소스 경로와 함수 이름은 모두 이 버전 기준이다.

## 이유

- 2026-11-13 PyPI 조회 기준 `info.version`이 1.109.1이고, 숫자만으로 된(pre-release가 아닌) 릴리스 중 가장 높은 버전이다[^pypi]. 같은 날 1.108.7, 1.106.9 같은 이전 라인 패치도 올라오지만 그것들은 하위 라인 유지보수 릴리스라 고르지 않았다.
- 이 핸즈온은 `CustomLogger`, `CustomLLM`, `search_tools`처럼 버전마다 시그니처가 자주 바뀌는 내부 API를 직접 쓴다. 버전을 고정하지 않으면 문서의 함수 이름과 줄 위치가 독자 환경에서 맞지 않는다.
- 기존 [LiteLLM 핸즈온](../../../litellm/)은 Docker 이미지를 썼지만, 이 핸즈온은 설치된 소스를 바로 열어야 해서 uv로 PyPI 패키지를 설치한다.
- 2026-11-13 기준 PyPI `vulnerabilities`, OSV, GitHub Advisory 모두 1.109.1에 해당하는 항목이 0건이다[^osv], [^ghsa]. 가장 최근 advisory(2026-10-27 공개)들의 영향 범위는 1.103 이하에서 끝난다.
- 1.109.x는 공개된 지 이틀 된 라인이라 회귀가 있을 수 있다. 단계 진행 중 버그를 만나면 버전을 바꾸지 말고 먼저 `docs/troubleshooting.md`에 남긴 뒤 판단한다.
