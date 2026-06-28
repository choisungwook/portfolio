# auto approve는 sandbox를 넓히는 설정일까

agent 자동화를 오래 돌리면 승인 요청이 귀찮아집니다. 그래서 auto approve를 켜면 sandbox가 넓어졌다고 느끼기 쉽습니다. 정말 그럴까요?

핵심은 다릅니다. **auto approve는 권한 경계를 넓히는 설정이 아니라, 경계를 넘으려는 요청을 누가 검토하는지 바꾸는 설정입니다.**

## auto approve와 auto review는 무엇을 바꿀까

Codex의 auto-review 흐름은 사람이 보던 승인 요청을 별도 reviewer agent가 판단하게 합니다. 이때 main agent의 sandbox는 그대로입니다.

예를 들어 network가 막힌 workspace-write 환경에서 agent가 외부 요청을 하려 하면 승인 요청이 생깁니다. reviewer가 승인하면 그 요청은 실행될 수 있지만, 그렇다고 모든 네트워크가 항상 열린 상태가 되는 것은 아닙니다.

## 어떤 항목이 자동 검토 대상이 될까

자동 검토 대상은 이미 approval이 필요한 요청입니다.

| 요청 | 자동 검토 가능성 | 이유 |
|---|---|---|
| workspace 안 파일 수정 | 낮음 | sandbox 안에서 허용되면 검토가 필요 없다 |
| workspace 밖 파일 쓰기 | 높음 | 경계를 넘는 쓰기다 |
| 네트워크 요청 | 높음 | 기본 sandbox에서 막히기 쉽다 |
| destructive 명령 | 높음 | 위험도가 크다 |
| side-effect가 있는 MCP/app tool | 높음 | 도구 annotation과 정책에 따라 승인 대상이다 |

그래서 auto approve 실험은 `make check` 결과만 보는 것으로 끝나지 않습니다. 어떤 항목에서 승인 요청이 생겼고, 그 요청이 사람에게 갔는지 reviewer agent에게 갔는지를 같이 기록해야 합니다.

## auto approve를 켜면 무엇을 얻고 무엇을 잃을까

장점은 긴 작업의 중단이 줄어든다는 점입니다. 테스트 중 네트워크가 필요한 패키지 설치, GitHub 조회, 임시 경로 접근 같은 항목이 정책상 허용 가능하면 사람이 매번 눌러주지 않아도 됩니다.

단점은 승인 판단을 사람이 직접 보지 않는다는 점입니다. reviewer가 위험 요청을 막도록 설계되어 있어도, 제품 문서 기준으로 deterministic security guarantee는 아닙니다. 그래서 민감 정보 접근, credential 탐색, 광범위한 보안 완화, destructive 명령은 여전히 조심해야 합니다.

## 실험 기록은 어떻게 남길까

아래 표를 사용합니다.

| 실행 환경 | approval reviewer | 요청 항목 | 결과 | 사람이 다시 볼 내용 |
|---|---|---|---|---|
| Codex CLI | user | network request | 확인 필요 | 실제 목적과 대상 도메인 |
| Codex CLI | auto_review | network request | 확인 필요 | reviewer 판단 이유 |
| Codex App | auto_review | outside write | 확인 필요 | 쓰기 대상 경로 |

권한을 넓혀야 한다면 broad full access보다 좁은 writable root나 구체적인 command prefix rule부터 검토합니다. 장점은 반복 작업의 마찰을 줄이면서 경계를 설명할 수 있다는 점입니다. 단점은 설정 관리가 조금 더 복잡해진다는 점입니다.

정리하면, auto approve는 "agent를 더 믿는다"가 아니라 "승인 경계의 검토자를 바꾼다"에 가깝습니다. sandbox를 넓히는 결정은 별도 설정으로 다루고, auto approve는 그 경계에서 반복되는 승인 비용을 줄이는 도구로 봐야 합니다.

## 참고자료

- [OpenAI Codex - Auto-review](https://developers.openai.com/codex/concepts/sandboxing/auto-review)
- [OpenAI Codex - Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
- [OpenAI Codex - Permissions](https://developers.openai.com/codex/permissions)
