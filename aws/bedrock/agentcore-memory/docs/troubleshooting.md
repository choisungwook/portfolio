# 트러블슈팅

실습 중 겪은 문제와 해결 방법입니다.

## terraform apply가 10분 가까이 걸림

- 증상: memory는 금방 만들어지지만 전략 4개를 붙이는 데 약 10분이 걸립니다(2026-11-14 측정 9분 55초).
- 원인: 전략을 하나 추가할 때마다 memory가 `UPDATING`을 거쳐 `ACTIVE`로 돌아와야 다음 전략을 붙일 수 있습니다. Terraform 코드는 이 충돌을 피하려고 `depends_on`으로 전략을 하나씩 순서대로 만듭니다.
- 해결: 기다립니다. `depends_on`을 지우고 병렬로 만들면 memory가 갱신 중이라는 오류가 날 수 있습니다.

## `uv run`이 `No interpreter found at path ...`로 실패

- 증상: `uv run -q scripts/chat.py ...`가 `error: No interpreter found at path '3.12.1/envs/jwt'`처럼 다른 프로젝트의 pyenv 가상환경을 찾다가 실패합니다.
- 원인: 홈 디렉터리의 pyenv `.python-version` 설정을 uv가 읽었습니다.
- 해결: workspace 루트에 `.python-version`(값 `3.13`)을 두었습니다. workspace 디렉터리에서 실행하면 이 파일이 먼저 읽힙니다.

## 3B 모델이 중국어나 다른 언어를 섞어 답함

- 증상: `qwen2.5:3b`가 "版本检查、备份数据、验证依赖。"처럼 중국어로 답하거나 "hiểu了" 같은 단어를 섞습니다.
- 원인: 장기 메모리 검색 결과로 긴 markdown 요약 5개가 system 메시지에 들어가자 작은 모델이 언어를 유지하지 못했습니다.
- 해결: 프롬프트에 넣는 record를 facts와 preferences로 좁히고(`PROMPT_NAMESPACES`), system 메시지에 "반드시 한국어로만 답한다"를 넣었습니다. 이후 대부분 한국어로 답했지만 짧은 답에서 다른 언어 단어가 섞이는 일은 가끔 남았습니다. 메모리 동작과는 관계없는 모델 품질 문제입니다.

## event를 모두 지웠는데 채팅창과 사용자가 목록에 남음

- 증상: `scripts/forget_actor.sh`로 event를 모두 지운 뒤에도 `list-sessions`와 `list-actors`가 그 session과 actor를 계속 돌려줍니다. 각 session의 `list-events`는 0건입니다.
- 원인: session과 actor 목록은 event 삭제와 함께 정리되지 않습니다. 1분 뒤 다시 조회해도 남아 있었습니다.
- 해결: API로 지울 방법이 없으므로, 사이드바에서 숨기려면 애플리케이션이 삭제 표시를 따로 저장합니다. memory 자체를 지우면 함께 사라집니다.

## record를 지웠는데 몇 개가 다시 보임

- 증상: `batch-delete-memory-records`로 목록의 record를 모두 지운 직후 다시 조회하면 몇 개가 남아 있고, 그중 일부는 삭제 요청에서 `failedRecords`로 돌아옵니다.
- 원인: `ListMemoryRecords`는 색인을 거쳐 늦게 반영됩니다. 삭제 직전에 추출이 끝난 record는 첫 조회에 보이지 않았고, 이미 지운 record는 잠시 목록에 남아 다시 지우려 하면 실패합니다.
- 해결: `scripts/forget_actor.sh`는 빈 목록이 10초 간격으로 두 번 연속 나올 때까지 조회와 삭제를 반복합니다. 삭제 직전까지 대화가 있었다면 추출이 끝날 때까지 몇 분 뒤 한 번 더 실행합니다.

## 셸 함수에서 `X-Session-Id` 헤더가 빠짐

- 증상: curl을 감싼 셸 함수로 같은 session에 질문을 보냈는데 매번 새 sessionId가 돌아오고 `short_term_messages=0`이 나옵니다.
- 원인: `${3:+-H "X-Session-Id: $3"}`처럼 따옴표가 든 인자를 변수 확장으로 만들면 zsh에서 단어가 의도대로 나뉘지 않습니다.
- 해결: OpenAI SDK를 쓰는 `scripts/chat.py`로 바꾸었습니다. 헤더는 `extra_headers`로 넘깁니다.

## AgentCore 콘솔 로그인 화면이 나옴

- 증상: 브라우저에서 AgentCore 콘솔 주소를 열면 AWS 로그인 화면으로 이동합니다.
- 원인: 콘솔은 CLI 자격 증명(`~/.aws`)을 쓰지 않습니다.
- 해결: 콘솔은 따로 로그인해야 합니다. 이 핸즈온의 조회는 모두 CLI로 할 수 있으므로 콘솔 없이도 실습을 끝낼 수 있습니다.

## default 프로파일이 `aws login`이면 backend가 자격 증명을 읽지 못함

- 증상: `default` 프로파일이 `aws login`으로 만든 프로파일(`~/.aws/config`에 `login_session` 항목)이면, boto3가 `Missing Dependency: Using the login credential provider requires an additional dependency. You will need to pip install "botocore[crt]"` 오류를 냅니다. 의존성을 넣은 뒤에도 로그인 세션이 만료되었으면 `LoginRefreshRequired: ... Please reauthenticate using 'aws login'`이 납니다.
- 원인: `aws login` 자격 증명 공급자는 awscrt가 필요합니다. 또한 로그인 세션은 시간이 지나면 만료됩니다.
- 해결: backend 의존성을 `boto3[crt]`로 두었습니다. 세션이 만료되었으면 맥북에서 `aws login`을 다시 실행한 뒤 `docker compose up -d`로 backend를 다시 띄웁니다. 이 핸즈온의 실습 출력은 access key 프로파일로 실행한 결과이며, `aws login` 프로파일로 컨테이너 안에서 세션이 갱신되는 경우(`~/.aws`가 읽기 전용 마운트)는 검증하지 않았습니다.
