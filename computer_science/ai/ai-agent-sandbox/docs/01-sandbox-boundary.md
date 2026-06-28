# sandbox 경계는 무엇을 막고 무엇을 남길까

AI agent에게 로컬 저장소를 맡기면 파일을 읽고, 코드를 고치고, 테스트를 실행합니다. 그런데 같은 agent가 홈 디렉터리나 네트워크까지 마음대로 접근해도 될까요?

이 핸즈온의 질문은 하나입니다. **agent sandbox는 자동화가 계속 움직이게 하면서 어떤 권한 경계를 남길까요?**

## sandbox와 approval은 왜 나뉠까

sandbox는 기술적인 경계입니다. 파일 시스템에서 어디를 쓸 수 있는지, 명령이 네트워크를 사용할 수 있는지, 프로세스가 어떤 범위 안에서 실행되는지를 제한합니다.

approval은 그 경계를 넘어가려는 순간의 의사결정입니다. 예를 들어 workspace 안 파일을 읽고 테스트를 돌리는 작업은 그대로 진행되지만, workspace 밖에 파일을 쓰거나 네트워크가 필요한 명령을 실행하려면 승인이 필요할 수 있습니다.

둘은 같은 설정이 아닙니다. sandbox가 좁으면 agent가 실제로 할 수 있는 일이 줄어듭니다. approval이 엄격하면 경계를 넘는 순간 사람이 확인하거나 자동 리뷰어가 판단합니다.

## 왜 성공과 실패를 모두 관찰해야 할까

권한 실험은 성공만 보면 의미가 약합니다. 로컬 셸에서 `curl`이 성공한다고 해서 agent sandbox에서도 네트워크가 열려 있다고 볼 수 없습니다. 반대로 일반 셸에서 가능한 파일 쓰기가 sandbox에서는 막힐 수 있습니다.

그래서 이 실험은 같은 항목을 반복해서 봅니다.

| 항목 | 제한된 환경에서 기대하는 값 | 관찰 이유 |
|---|---|---|
| workspace 파일 읽기 | allowed | agent가 저장소를 이해해야 한다 |
| workspace 파일 쓰기 | allowed | 코드 수정이 가능한지 확인한다 |
| workspace 밖 파일 읽기 | profile dependent | 설정에 따라 읽기 범위가 달라질 수 있다 |
| workspace 밖 파일 쓰기 | blocked | 불필요한 로컬 오염을 막는지 본다 |
| 네트워크 요청 | blocked | 외부 전송 경계를 확인한다 |
| 로컬 명령 실행 | allowed | 테스트와 진단 명령 실행 가능성을 본다 |
| Git 상태 확인 | allowed | 변경 검토가 가능한지 본다 |

## 제한이 강하면 작업성이 떨어지지 않을까

강한 제한은 안전하지만 불편합니다. 예를 들어 네트워크가 막혀 있으면 패키지 설치, 원격 API 확인, GitHub 조회가 멈춥니다. 장점은 민감 정보 전송과 의도하지 않은 외부 통신을 줄일 수 있다는 점입니다.

반대로 full access는 작업성이 좋습니다. 하지만 workspace 밖 파일, 네트워크, 로컬 서비스에 대한 경계가 약해집니다. 그래서 기본값으로는 좁은 sandbox를 두고, 필요한 순간에만 좁게 승인하는 편이 설명 가능성이 좋습니다.

## 이 실험에서 조심할 점은 무엇일까

스크립트는 위험한 삭제나 민감 파일 접근을 하지 않습니다. workspace 안의 작은 probe 파일과 `/Users/Shared/ai-agent-sandbox-outside-write.txt`만 생성하려고 시도합니다.

다만 결과 해석은 실행 환경에 묶입니다. 같은 스크립트라도 일반 터미널, Codex CLI, Codex App, Claude Code에서 다르게 보일 수 있습니다. 다르면 한쪽이 틀렸다는 뜻이 아니라, 실행 주체와 권한 설정이 다르다는 뜻입니다.

정리하면, sandbox는 agent를 멈추게 하려는 장치가 아니라 agent가 어디까지 스스로 움직일 수 있는지 설명 가능하게 만드는 경계입니다. 이 경계를 먼저 확인해야 auto approve나 full access 같은 설정을 판단할 수 있습니다.

## 참고자료

- [OpenAI Codex - Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
- [OpenAI Codex - Sandbox](https://developers.openai.com/codex/concepts/sandboxing)
- [OpenAI Codex - Permissions](https://developers.openai.com/codex/permissions)
