# 트러블슈팅

## get-agent-runtime 응답에 platformVersion이 없음

- 증상: `aws bedrock-agentcore-control get-agent-runtime --query platformVersion`이 `null`을 출력하고, `create-agent-runtime help`에 `--platform-version`이 없음.
- 원인: AWS CLI가 응답을 자기 서비스 모델로 파싱하므로, 모델에 없는 필드는 버림. 2.36.29에는 `platformVersion`이 없었음.
- 해결: AWS CLI를 올림(2.40.2에서 확인). `scripts/runtime.py`는 PEP 723 머리로 최신 boto3를 받으므로 CLI 버전과 무관하게 값을 보여 줌.

## platform_version을 생략했는데 V2가 아님

- 증상: 발표문은 서울 신규 runtime의 기본값이 V2라고 하는데, Terraform으로 `platform_version` 없이 만든 `rtv2_default`가 `V1`.
- 원인: API(`CreateAgentRuntime`)는 `platformVersion`을 생략하면 V1을 씀. 개발자 가이드와 Terraform provider 문서도 같음(2026-11-13 기준).
- 해결: V2가 필요하면 `platform_version = "V2"`를 명시함.

## uv run이 No interpreter found 오류로 멈춤

- 증상: `uv run scripts/runtime.py`가 `error: No interpreter found at path ...`로 실패.
- 원인: 상위 디렉터리의 `.python-version`이 존재하지 않는 pyenv 가상환경을 가리킴. uv는 가장 가까운 `.python-version`을 읽음.
- 해결: workspace 루트에 `.python-version`(`3.13`)을 둠.

## USAGE_LOGS 조회 결과가 비어 있음

- 증상: session을 끝낸 직후 `runtime.py usage --session <ID>`가 `records=0`.
- 원인: 사용량 로그는 최대 60분 늦게 도착함.
- 해결: 30~60분 뒤 다시 조회함. 조회 시간대는 session을 연 시각이 아니라 레코드의 `event_timestamp` 기준임.
