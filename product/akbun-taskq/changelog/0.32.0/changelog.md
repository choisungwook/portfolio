# akbun-taskq 0.32.0

## Added

- 모든 Claude bot과 작업 실행에서 auto compaction이 항상 켜진다. 대화가 모델의 context window를 채우면 Claude Code가 스스로 앞부분을 요약해 이어 가므로, 긴 세션이 "prompt is too long"으로 멈추지 않는다. 사용자의 Claude 설정에서 auto-compact를 꺼 두었어도 taskq가 시작한 세션에서는 켜진다.
- bot 대화의 작업 과정에 압축이 "Compact · Auto-compacted 180,000 tokens of conversation" 항목으로 남는다. 앞뒤 도구 호출과 함께 접혀 있으면 펼쳐서 본다.

## SDK

Claude Agent SDK `Options.settings`로 `{ autoCompactEnabled: true }`를 넘기고, `compact_boundary` 시스템 메시지를 turn step으로 기록한다.
