# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [LiteLLM 1.109.1로 고정](2026-11-litellm-version.md) - PyPI 최신 stable 하나로 고정하고 소스 경로를 그 버전 기준으로 적는다.
* [훅 코드를 gateway 패키지로 설치해 Proxy가 import하게 한다](2026-11-gateway-package.md) - config를 config/에 두면서 callbacks 문자열을 import하는 방법.
* [판단 기록은 spend_logs_metadata 목록에, 질문은 해시로만 남긴다](2026-11-observe-without-raw-text.md) - jsonb가 key 순서를 잃고 안쪽 호출이 spend log에 남지 않아서.
