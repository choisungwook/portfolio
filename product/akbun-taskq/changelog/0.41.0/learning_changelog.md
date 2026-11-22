# akbun-taskq 0.41.0 학습 노트

`akbun-taskq`의 기존 bot 메모리(`memory_write`)는 매 턴 시스템 프롬프트에 통째로 들어가는 짧은 자기 메모이고, 세션 간 장기 검색은 `akbun-aimemory`가 맡는다. 기존 메모리 저장소를 옮기지 않고 공존하도록 `BotsConfig`에 선택 필드 `aimemory: { enabled, command, args?, home? }`를 추가했다.

`bots.aimemory.enabled`가 `true`일 때만 `src/team/tools-memory.ts`가 `aimemory_search`와 `aimemory_add`를 bot 도구 목록에 붙인다. 실행은 `execFileSync`로 `aimem` CLI를 직접 호출해 셸 인젝션을 피했고, `aimem` 실행 실패 시 `aimemory_search`는 예외 대신 `{ degraded: true, hits: [] }`를 돌려주어 bot 턴이 중단되지 않게 했다.
