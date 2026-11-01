# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [firewall은 NAT 앞에 두고, app subnet은 VPC 모듈 밖에서 AZ별 route table로 만든다](2026-10-firewall-before-nat.md) - 로그에 서버 IP를 남기고 single NAT에서도 AZ별 대칭 라우팅을 하려는 구성.
