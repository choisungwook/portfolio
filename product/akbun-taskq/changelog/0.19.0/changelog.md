# akbun-taskq 0.19.0

## Added

- 긴 대화를 새 세션으로 넘긴다. bot의 대화가 설정 > 사용량 제한의 "새 세션으로 넘기는 대화 크기"(`session_max_tokens`, 기본 100,000 토큰)나 모델 context의 80%를 넘으면, taskq가 그 bot에게 인수인계 메모를 쓰라고 한 번 요청한다. bot은 그 turn에 함께 온 메시지를 평소대로 처리한 뒤 `write_handover`로 메모(7,500자까지)를 남기고, turn이 끝나면 세션이 비워지며 메모가 새 세션의 첫 메시지로 온다. 세션의 첫 turn에는 요청하지 않고, 사용자가 대화를 초기화했거나 요청한 turn이 취소됐으면 요청을 거둔다. 이어지는 대화는 매 turn 전체가 다시 전송(또는 과금)되므로 몇 주 쓴 bot의 turn당 입력 토큰이 계속 커지던 것을 막는다. Claude, OpenAI(API key, Bedrock), Kiro bot에 적용된다.
- Codex CLI bot은 Codex가 자기 thread를 요약하므로, 같은 한도를 `model_auto_compact_token_limit`으로 넘긴다.
- bot 도구 `write_handover`: taskq가 인수인계를 요청했을 때만 쓸 수 있다.

## SDK

Codex CLI 호출에 `--config model_auto_compact_token_limit=<session_max_tokens>`가 추가됐다. 그 밖의 SDK 사용 변경 없음.
