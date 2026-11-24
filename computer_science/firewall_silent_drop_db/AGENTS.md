# firewall_silent_drop_db

애플리케이션과 PostgreSQL primary/replica 사이의 보안장비(stateful firewall, IPS)가 RST 없이 패킷을 drop할 때 생기는 커넥션 장애와 DB 부하를 재현하는 핸즈온이다.

글로벌 규칙은 @../../AGENTS.md 를 따른다.

## 상태

설계만 있고 구현은 없다. 구현을 시작하기 전에 [docs/0-design.md](docs/0-design.md)의 "미결정 사항"부터 정한다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.
