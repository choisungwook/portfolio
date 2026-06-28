# Codex CLI에서 권한 경계를 어떻게 관찰할까

Codex CLI는 로컬 저장소에서 명령을 실행합니다. 그런데 `codex`가 실행하는 명령과 내가 터미널에서 직접 실행하는 명령은 같은 권한을 가질까요?

이 문서는 같은 probe를 일반 셸과 Codex CLI 안에서 실행해 차이를 기록하는 방법을 정리합니다.

## 먼저 일반 셸 결과를 왜 봐야 할까

일반 셸 결과는 baseline입니다. 이 값은 sandbox 결과가 아니라 현재 사용자 계정의 평범한 권한입니다.

프로젝트 루트에서 실행합니다.

```bash
cd computer_science/ai/ai-agent-sandbox
make check
```

예상되는 관찰 포인트는 다음과 같습니다.

| 항목 | 일반 셸에서 자주 보이는 결과 | 해석 |
|---|---|---|
| workspace file read | allowed | 현재 디렉터리를 읽을 수 있다 |
| workspace file write | allowed | probe 파일을 만들 수 있다 |
| outside workspace file read | allowed | `/etc/hosts`는 보통 읽을 수 있다 |
| outside workspace file write | allowed | `/tmp` 쓰기가 보통 가능하다 |
| network request | allowed | 네트워크가 열려 있으면 성공한다 |
| shell command | allowed | `uname` 실행 가능 |
| git status | allowed | 저장소 상태 확인 가능 |

일반 셸에서 실패한 항목이 있다면 sandbox 문제가 아닐 수 있습니다. 로컬 네트워크, Python, Git, 파일 권한부터 먼저 봐야 합니다.

## Codex CLI에서는 어떤 프롬프트로 실행할까

Codex CLI 안에서 agent에게 같은 명령을 실행하게 해야 합니다. 사람이 직접 터미널에서 `make check`를 실행하면 Codex sandbox가 아니라 일반 셸 권한을 본 것입니다.

예시 프롬프트:

```text
computer_science/ai/ai-agent-sandbox 로 이동해서 make check를 실행하고, 각 observed 결과를 표로 정리해줘. 승인 요청이 나오면 어떤 항목 때문에 필요한지도 같이 적어줘.
```

권한 모드를 명시하고 싶다면 CLI 실행 시 다음처럼 시작합니다.

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

이 모드는 workspace 안 작업은 자동으로 진행하고, workspace 밖 쓰기나 네트워크처럼 경계를 넘는 작업은 승인 흐름으로 보낼 수 있습니다.

## 결과는 어떻게 기록할까

관찰 결과는 아래 형식으로 문서 작업자에게 넘기면 좋습니다.

| 실행 환경 | workspace write | outside write | network | approval 요청 | 메모 |
|---|---|---|---|---|---|
| 일반 셸 | 확인 필요 | 확인 필요 | 확인 필요 | 없음 | baseline |
| Codex CLI workspace-write/on-request | 확인 필요 | 확인 필요 | 확인 필요 | 확인 필요 | agent 실행 결과 |

여기서 중요한 값은 성공 여부 자체보다 차이입니다. 일반 셸에서는 네트워크가 되는데 Codex CLI에서는 막힌다면, 그것이 sandbox의 네트워크 경계입니다.

## 어떤 결과가 나오면 의심해야 할까

workspace 밖 쓰기가 바로 성공하면 설정을 다시 봐야 합니다. `/tmp`가 writable root로 들어가 있거나 full access에 가까운 설정일 수 있습니다. 장점은 임시 파일 기반 도구가 잘 돈다는 점입니다. 단점은 agent가 workspace 밖에 흔적을 남길 수 있다는 점입니다.

네트워크가 바로 성공하면 `sandbox_workspace_write.network_access`, permission profile, full access 여부를 확인해야 합니다. 장점은 패키지 설치와 원격 API 확인이 빠르다는 점입니다. 단점은 외부 전송 경계가 약해진다는 점입니다.

정리하면, Codex CLI 실험은 "무엇이 가능한가"보다 "어떤 요청이 승인 경계로 올라오는가"를 보는 실험입니다. 그 경계를 알아야 자동화에 필요한 최소 권한을 정할 수 있습니다.

## 참고자료

- [OpenAI Codex - CLI features](https://developers.openai.com/codex/cli/features)
- [OpenAI Codex - Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
