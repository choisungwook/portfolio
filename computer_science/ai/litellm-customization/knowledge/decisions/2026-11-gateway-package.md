---
type: Decision
title: 훅 코드를 gateway 패키지로 설치해 Proxy가 import하게 한다
description: config를 config/ 아래에 두면서 callbacks 문자열을 import하려고 workspace를 editable 패키지로 설치한다
tags: [litellm, uv, callbacks]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-13T03:40:00Z }
---

## 결정

`pyproject.toml`에 hatchling 빌드 설정과 `packages = ["gateway"]`를 두고 `uv sync`로 workspace를 가상환경에 설치한다. config의 `callbacks`, `custom_handler`는 `gateway.<모듈>.<인스턴스>`로 쓴다.

## 이유

- `get_instance_fn`은 먼저 config 파일과 같은 디렉터리에서 `<모듈 경로>.py`를 찾고, 없으면 `importlib.import_module`을 쓴다. config를 단계별로 `config/`에 모았으므로 첫 경로는 맞지 않는다.
- `uv run litellm`은 console script라 import 경로에 workspace 디렉터리가 들어가지 않는다. 패키지로 설치하는 것이 `PYTHONPATH`를 명령마다 붙이는 것보다 문서의 명령을 짧게 유지한다.
- config 옆 파일 방식은 파일 하나를 모듈로 직접 실행하므로 `gateway` 안의 다른 모듈을 import하는 경로가 보장되지 않아 쓰지 않았다.
