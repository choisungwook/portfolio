# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-08

* **Update**: [OKF v0.2 스펙 사본](references/okf-spec-0.2.md) 0.1 사본을 0.2 원문으로 교체. 0.2부터 timestamp와 Citations 대신 generated와 sources를 씀.

## 2026-11-01

* **Update**: [route 전환 시 열린 연결은 유지됐지만, 비대칭 구간의 새 연결은 실패했다](topics/route-cutover-existing-flows.md) 재실측 추가. 응답 경로만 먼저 넣은 AZ가 55초간 끊겼고 firewall metric에는 보이지 않았다.

## 2026-10-31

* **Creation**: [firewall은 NAT 앞에 두고, app subnet은 VPC 모듈 밖에서 AZ별 route table로 만든다](decisions/2026-10-firewall-before-nat.md) 결정 기록. 모듈의 single NAT 제약과 log resource policy 이유를 남긴다.
* **Creation**: [route를 firewall로 바꿔도 이미 열린 연결은 끊기지 않았다](topics/route-cutover-existing-flows.md) 통찰 기록. cutover 실측값과 문서와 어긋난 점을 남긴다.
