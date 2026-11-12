# Troubleshooting

실습 중 실제로 겪은 문제와 해결 방법입니다.

## `uv run`이 `No interpreter found at path`로 실패함

- 증상: `uv run app/order_flow.py`가 `error: No interpreter found at path '3.12.1/envs/jwt'`로 끝납니다.
- 원인: 홈 디렉터리의 `.python-version`이 지워진 pyenv 가상환경을 가리키고, uv가 그 파일을 따릅니다.
- 해결: 그 셸에서만 `export UV_PYTHON=3.13`처럼 설치된 Python을 지정합니다. 스크립트는 `requires-python = ">=3.12"`라 3.12 이상이면 됩니다.

## emulator 호출이 `InvalidClientTokenId`로 실패함

- 증상: `aws sts get-caller-identity`가 `The security token included in the request is invalid.`를 돌려줍니다.
- 원인: 셸에 `AWS_PROFILE`이나 `AWS_ACCESS_KEY_ID`가 남아 실제 자격 증명으로 서명했습니다. 환경 변수가 credentials 파일보다 우선합니다.
- 해결: `source emulator.env`를 다시 실행합니다. 이 파일이 실제 자격 증명 변수를 지웁니다.

## 재시작 후 앞에서 만든 리소스가 없음

- 원인: emulator는 상태를 메모리에만 둡니다. `docker restart`나 `docker stop`에서 모두 사라집니다.
- 해결: 정상 동작입니다. 상태가 필요한 테스트는 같은 emulator 실행 안에서 준비부터 다시 합니다.

## evaluation suite 의존성 설치가 너무 큼

- 증상: `uv sync --locked --extra checks`가 `aws-cdk-lib`, `kubernetes`, `opensearch-py` 같은 큰 패키지를 받습니다.
- 원인: `checks` extra는 29,676개 fidelity test 전체가 import하는 패키지 목록입니다.
- 해결: 테스트 하나만 돌릴 때는 `uv run fidelity-tests-runner requirements <파일>`로 그 테스트가 쓰는 도구만 확인해 설치합니다. 이 핸즈온은 러너를 실행하지 않고 공개 점수 파일로 분석했습니다.
