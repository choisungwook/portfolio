# Agent Guide

- SSM Inventory 핸즈온. 기본 수집, PutInventory custom inventory, ECS·Lambda 불가 이유, resource data sync를 다룬다.
- 공통 규칙: @../../../AGENTS.md
- 리전 ap-northeast-2. ECS·Lambda 리소스는 만들지 않는다. 형식 검증에서 거부되므로 가짜 ID로 충분하다.
- 2026-11-10 기준 실제 AWS 미실행. 문서 출력은 "예상 출력(미검증)"이다. 실행하면 실제 값으로 바꾸고 표시를 지운다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
