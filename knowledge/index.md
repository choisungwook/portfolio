---
okf_version: "0.1"
---

# Knowledge

AI agent가 작업하면서 축적하는 지식 번들이다. Google이 제안한 [Open Knowledge Format(OKF) 0.1](references/okf-spec-0.1.md)을 따른다. 코드와 git history가 기록하지 못하는 의사결정의 이유, 반복 절차, 도메인 통찰을 markdown + YAML frontmatter로 남긴다.

## 디렉터리

* [decisions/](decisions/index.md) - 작업 중 내린 의사결정과 그 이유 (ADR)
* [playbooks/](playbooks/index.md) - 반복되는 작업 절차
* [topics/](topics/index.md) - 핸즈온을 반복하며 얻은 도메인 통찰
* [references/](references/index.md) - 외부 자료의 저장소 내 사본

## 작성 규칙

concept 작성 규칙은 [.claude/rules/knowledge.md](../.claude/rules/knowledge.md)를 따른다. 변경 이력은 [log.md](log.md)에 남긴다.
