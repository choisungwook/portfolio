# PostgreSQL RBAC 인증·인가 핸즈온

로컬 Docker(`mysql:8.4`, `postgres:16`, `flyway/flyway:10`) 환경에서 MySQL과 PostgreSQL의 인증·인가 모델 차이를 비교하고, Flyway 마이그레이션 소유권(Ownership) 장애·롤백과 무중단 비밀번호 로테이션 장애·해결 패턴을 직접 재현하는 핸즈온이다.

@../../AGENTS.md

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.
