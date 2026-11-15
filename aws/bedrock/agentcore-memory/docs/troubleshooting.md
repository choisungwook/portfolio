# 트러블슈팅

실습 중 발생할 수 있는 주요 문제와 원인, 해결 방법을 정리했습니다.

## `terraform apply` 소요 시간 지연 (약 10분)

- 증상: memory 리소스 자체는 빠르게 생성되지만 전략 4개를 연결하는 데 약 10분이 소요됩니다(실측 9분 55초).
- 원인: 전략을 하나 추가할 때마다 memory 상태가 `UPDATING`을 거쳐 `ACTIVE`로 복귀해야 다음 전략을 추가할 수 있습니다. Terraform 코드는 상태 충돌을 방지하기 위해 `depends_on`으로 전략을 순차 생성합니다.
- 해결: 완료될 때까지 대기합니다. `depends_on`을 제거하고 병렬로 생성하면 memory가 갱신 중이라는 API 오류가 발생할 수 있습니다.

## `uv run`의 잘못된 Python 인터프리터 경로 참조

- 증상: `uv run -q scripts/chat.py ...` 실행 시 `error: No interpreter found at path '3.12.1/envs/jwt'`처럼 다른 프로젝트의 pyenv 가상환경을 참조하다가 실패합니다.
- 원인: 홈 디렉터리의 pyenv `.python-version` 설정을 `uv`가 먼저 읽었기 때문입니다.
- 해결: workspace 루트에 `.python-version`(값 `3.13`)을 배치해 두었습니다. `aws/bedrock/agentcore-memory` 디렉터리에서 실행하면 해당 파일이 우선 적용됩니다.

## 3B 모델의 다국어 혼용 응답 현상

- 증상: `qwen2.5:3b`가 "版本检查、备份数据、验证依赖。"처럼 중국어로 답하거나 "hiểu了" 같은 타 언어 단어를 섞어 출력합니다.
- 원인: 장기 메모리 검색 결과로 길이가 긴 markdown 요약 5개가 system 메시지에 포함되면서 소형 모델이 언어 일관성을 유지하지 못했습니다.
- 해결: 프롬프트에 포함하는 record를 `facts`와 `preferences`로 제한하고(`PROMPT_NAMESPACES`), system 메시지에 "반드시 한국어로만 답한다" 지침을 추가했습니다. 이후 대부분 한국어로 응답하지만, 짧은 답변에서 타 언어 단어가 간헐적으로 섞이는 현상은 메모리 동작과 무관한 소형 모델 자체의 한계입니다.

## event 삭제 후에도 session과 actor 목록이 유지되는 현상

- 증상: `scripts/forget_actor.sh`로 event를 모두 삭제한 뒤에도 `list-sessions`와 `list-actors`가 해당 session과 actor를 계속 반환합니다. 각 session의 `list-events` 결과는 0건입니다.
- 원인: AgentCore Memory에서 session과 actor 메타데이터 목록은 event 삭제와 연동되어 자동 정리되지 않습니다.
- 해결: API로 개별 session이나 actor를 목록에서 제거할 방법이 없으므로, UI 사이드바에서 숨기려면 애플리케이션 측에 삭제 플래그를 별도로 저장해야 합니다. memory 리소스 자체를 삭제하면 함께 정리됩니다.

## record 삭제 직후 재조회에 따른 일시적 잔존 현상

- 증상: `batch-delete-memory-records`로 목록의 record를 삭제한 직후 다시 조회하면 일부가 남아 있고, 재삭제 요청 시 `failedRecords`로 반환됩니다.
- 원인: `ListMemoryRecords`는 색인 반영에 지연이 있습니다. 삭제 직전에 추출이 완료된 record는 첫 조회에 나타나지 않았고, 이미 삭제된 record는 색인 갱신 전까지 목록에 남아 재삭제 시 실패합니다.
- 해결: `scripts/forget_actor.sh`는 10초 간격으로 조회와 삭제를 반복해 빈 목록이 두 번 연속 반환될 때까지 수행합니다. 삭제 직전까지 대화가 있었다면 비동기 추출이 끝난 뒤 수 분 후에 스크립트를 한 번 더 실행합니다.

## 셸 함수 호출 시 `X-Session-Id` 헤더 누락

- 증상: `curl`을 감싼 셸 함수로 동일 session에 질문을 보냈음에도 매번 새 `sessionId`가 발급되고 `short_term_messages=0`이 반환됩니다.
- 원인: `${3:+-H "X-Session-Id: $3"}`처럼 따옴표가 포함된 인자를 변수 확장으로 구성하면 zsh에서 단어 분할(word splitting)이 의도대로 동작하지 않습니다.
- 해결: OpenAI 공식 SDK를 사용하는 `scripts/chat.py`로 대체해 `extra_headers`로 헤더를 전달합니다.

## AgentCore 콘솔 접근 시 로그인 화면 리다이렉트

- 증상: 브라우저에서 AgentCore 콘솔 URL을 열면 AWS 로그인 화면으로 이동합니다.
- 원인: 웹 콘솔은 로컬 CLI 자격 증명(`~/.aws`)을 공유하지 않습니다.
- 해결: 콘솔을 확인하려면 브라우저에서 별도로 로그인해야 합니다. 이 핸즈온의 모든 조회 작업은 CLI로 수행 가능하므로 콘솔 접속 없이도 실습을 완료할 수 있습니다.

## `aws login` 기반 default 프로파일의 컨테이너 내 자격 증명 인식 실패

- 증상: `default` 프로파일이 `aws login`으로 생성된 프로파일(`~/.aws/config`에 `login_session` 항목 포함)인 경우, boto3가 `Missing Dependency: Using the login credential provider requires an additional dependency. You will need to pip install "botocore[crt]"` 오류를 발생시킵니다. 의존성을 설치한 뒤에도 로그인 세션이 만료되었다면 `LoginRefreshRequired: ... Please reauthenticate using 'aws login'` 오류가 발생합니다.
- 원인: `aws login` 자격 증명 공급자는 `awscrt`가 필요하며, 로그인 세션은 일정 시간이 지나면 만료됩니다.
- 해결: backend 의존성을 `boto3[crt]`로 지정해 두었습니다. 세션이 만료되면 호스트에서 `aws login`을 다시 실행한 뒤 `docker compose up -d`로 backend를 재기동합니다. 참고로 `~/.aws`가 읽기 전용으로 마운트되므로 컨테이너 내부에서 로그인 세션을 자동 갱신하는 동작은 지원되지 않습니다.
