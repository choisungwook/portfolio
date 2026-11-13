---
type: Topic
title: AgentCore Memory의 실측 동작(추출 지연, 병합, 목록, 한도)
description: 문서에 없거나 문서와 다른, 실제로 재 본 AgentCore Memory 동작 모음
tags: [bedrock, agentcore, memory, quotas]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-14T00:00:00Z }
---

2026-11-14 서울 리전, AWS CLI 2.40.2, AWS provider 6.73 기준이다.

- 추출 지연: SEMANTIC, USER_PREFERENCE, SUMMARIZATION은 마지막 event 뒤 약 80초~3분에 record가 보였다. EPISODIC은 약 10~15분 뒤였다. 대화가 끝났다고 사용자가 명시해도 15분 걸렸다.
- 병합: 바뀐 정보가 오면 기존 record를 고치지 않고 지운 뒤 새 ID의 record를 만든다. record ID를 외부 키로 쓰면 끊어진다. 같은 record가 이후 대화로 다시 병합되어 내용이 바뀌기도 했다.
- 추출 모델은 상대 날짜를 절대 날짜로 바꾸고("다음 주 화요일" → 2026-11-17), 사용자가 말하지 않은 추론("Rust도 활용한다")을 섞는다. JSON IngestData의 preferences와 reflection은 영어로 만들어졌다.
- `ListSessions`, `ListActors`는 event를 모두 지운 session과 actor를 계속 돌려준다.
- `ListMemoryRecords`는 늦게 반영된다. 삭제 직후 조회에 지운 record가 남거나 막 생긴 record가 빠진다. 사용자 삭제는 빈 목록이 두 번 나올 때까지 반복한다.
- `ListEvents`는 최신순으로 돌려준다. 모델에 넣기 전에 시간순으로 다시 정렬해야 한다.
- Service Quotas 적용값이 문서 기본값보다 낮았다. memory당 전략 4(문서 6), 리전당 memory 20(문서 150), 계정당 전략 80(문서 900). us-east-1, ap-northeast-1도 같아 서울만의 제약이 아니라 계정 적용값이다. memory당 전략 수는 조정 불가라 내장 4개를 켜면 custom 전략을 붙일 수 없다.
- 전략 4개를 Terraform `depends_on`으로 순서대로 붙이니 apply가 약 10분 걸렸다.
- EPISODIC 전략은 도구를 쓰지 않은 일반 채팅도 episode로 만들고 답변 품질(언어 혼용, 형식 미준수)을 `assessment: No`로 평가했다.
