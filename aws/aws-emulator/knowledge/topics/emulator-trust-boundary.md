---
type: Topic
title: AWS Emulator는 오류 형식은 믿을 만하지만 권한과 판정은 release마다 다시 본다
description: v1.0.322 실측에서 확인한 fidelity, 정책 평가, skill 판정의 실제 동작
tags: [aws-emulator, fidelity, iam, ai-agent]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-12T08:00:00Z }
---

2026-11-12, emulator v1.0.322(commit `7753983c`) 실측. 상세는 [3-fidelity.md](../../docs/3-fidelity.md), [4-limits.md](../../docs/4-limits.md), [5-agent-skill.md](../../docs/5-agent-skill.md).

- 흔한 오류 7건 중 6건이 상태 코드, 오류 코드, 메시지까지 실제 AWS와 같았다. 다른 1건은 `501 NotImplemented`(IAM `TagMFADevice`)라 조용히 틀리지 않고 바로 실패한다.
- identity 정책은 평가하지 않는다(정책 없는 사용자의 `ListBuckets` 성공). 버킷 정책의 명시적 Deny는 평가했다. skill 문서는 둘 다 평가하지 않는다고 적어서 문서와 동작이 어긋난다.
- SQS와 DynamoDB는 리전별로 분리됐다. 공식 문서는 "일부 서비스는 공유"라고만 하므로 서비스마다 확인이 필요하다.
- skill 호환성 점검은 실제로 다섯 번 성공한 앱에도 `WILL NOT WORK`(UNVERIFIED)를 냈다. 가장 흔한 호출(`CreateBucket`, `PutObject`)일수록 그 호출만 주제로 한 trace가 드물어 `UNVERIFIED`가 된다. 판정은 "통과 증거가 없는 호출 목록"으로 읽는다.
- DynamoDB 테이블 생성 직후 첫 `DescribeTable`이 약 3초 걸린 뒤 `ACTIVE`를 준다. emulator도 비동기 상태 전이를 흉내 낸다.
