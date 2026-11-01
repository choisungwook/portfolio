---
type: Topic
title: route 전환 시 열린 연결은 유지됐지만, 응답 경로만 먼저 들어간 비대칭 구간의 새 연결은 실패했다
description: midstream 연결은 유지됐지만 응답 경로만 들어간 비대칭 구간에서는 새 연결이 실패했고 firewall metric에는 드러나지 않았다.
tags: [aws, network-firewall, rollout]
timestamp: 2026-10-31T00:00:00Z
---

2026-10-31 ap-northeast-2 실측:

- 조건: stateful default action `aws:alert_established`, stream exception policy `REJECT`, 100KB/s로 제한한 HTTPS 다운로드를 연 상태에서 app route를 NAT → vpce로 바꿈.
- 결과: 다운로드는 끊기지 않았다. 이후 default action을 `aws:drop_established_app_layer_to_server`로 바꾼 뒤에도 유지됐다(목적지가 허용 목록 도메인). `StreamExceptionPolicyPackets`, `RejectedPackets`는 0.
- 2초 간격 probe는 route 변경 중 실패 0회.

2026-11-01 ap-northeast-2 재실측(alert 전용 policy, Reject):

- public route table에 두 AZ의 응답 경로(app CIDR → vpce)를 먼저 모두 넣고 AZ a, c 순서로 app route를 바꿨다.
- AZ a: 응답 경로 추가 후 9초 뒤 app route 전환. 그 사이 probe 1회 실패.
- AZ c: 응답 경로만 들어간 55초 동안 probe 전부 실패, app route 전환 직후 회복.
- 실패 구간의 `ReceivedPackets`, `RejectedPackets`, `StreamExceptionPolicyPackets`는 모두 0. 비대칭 실패는 firewall metric으로 보이지 않는다.
- 결론: 응답 경로와 app route 변경은 AZ마다 연달아 실행한다. 핸즈온 7단계와 운영 문서 2단계를 이 순서로 고쳤다.
- policy 변경 반영: sync 약 55초, 차단 시작은 저장 후 약 45초.
- firewall 생성 5분, 삭제 4분.

문서(stream exception policy, flow flush 블로그)는 상태 없는 midstream 패킷이 stream exception policy를 따른다고 쓴다. 실측과 어긋나므로 운영 문서에는 "끊길 수 있다고 계획한다"로 남겼다. 허용 목록에 없는 목적지로 이미 열린 연결이 drop 전환 뒤 유지되는지는 확인하지 않았다(`더 공부할 것`).
