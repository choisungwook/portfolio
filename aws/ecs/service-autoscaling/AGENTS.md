# ECS Service Auto Scaling 핸즈온

- ALB 뒤 Fargate service에 ALBRequestCountPerTarget target tracking을 걸고, k6 부하로 scale-out과 scale-in, scaling 알림을 확인하는 실습.
- 글로벌 규칙: @../../../AGENTS.md

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
