# Knowledge 기록 규칙

`knowledge/` 디렉터리는 Open Knowledge Format(OKF) 0.1을 따르는 지식 번들이다. 스펙 원문은 [knowledge/references/okf-spec-0.1.md](../../knowledge/references/okf-spec-0.1.md)에 사본으로 있다. 이 규칙 파일만으로 기록에 충분하며, 형식이 모호할 때만 스펙 사본을 참조한다. agent는 작업하면서 얻은 지속 가치가 있는 컨텍스트를 여기에 기록한다.

## 기록 시점

PR을 만들기 직전에 이번 작업에서 남길 지식이 있는지 검토하고, 있으면 같은 commit에 포함한다.

## 무엇을 기록하는가

| 디렉터리 | 대상 | type |
| --- | --- | --- |
| `knowledge/decisions/` | 작업 중 내린 의사결정과 이유. Issue의 ADR 중 앞으로의 작업에도 영향을 주는 것 | `Decision` |
| `knowledge/playbooks/` | 두 번 이상 반복된 작업 절차 | `Playbook` |
| `knowledge/topics/` | 여러 핸즈온을 관통하는 도메인 통찰 | `Topic` |
| `knowledge/references/` | 외부 자료의 저장소 내 사본 | `Reference` |

기록하지 않는 것:

- 코드, git history, 핸즈온 문서가 이미 기록하는 내용
- 이번 작업에만 유효한 일회성 정보와 대화 맥락
- `.claude/rules/`에 이미 규칙으로 존재하는 내용 (규칙의 "이유"는 decision으로 기록할 수 있다)

## Concept 작성 형식

모든 concept는 YAML frontmatter로 시작하며 `type`은 필수다.

frontmatter 형식:

```yaml
---
type: Decision            # 필수. Decision | Playbook | Topic
title: 한 줄 제목
description: 한 문장 요약
tags: [kubernetes, workflow]
timestamp: 2026-07-10T00:00:00Z
---
```

본문 규칙:

- Decision은 `## 결정`과 `## 이유` 섹션을 쓴다.
- 외부 근거(PR, 블로그, 공식 문서)가 있으면 `## Citations` 섹션에 번호 목록으로 남긴다.
- 관련 concept는 markdown 상대 링크로 연결한다. 링크 대상이 아직 없어도 괜찮다.
- 외부 웹 링크에 의존하지 않는다. agent가 다시 읽어야 할 외부 자료는 `knowledge/references/`에 사본으로 저장하고 로컬 경로로 연결한다. 외부 URL은 provenance 기록용으로 frontmatter의 source 필드나 Citations에만 남긴다.
- 분량은 A4 반 장 이내로 짧게 쓴다.

## 기록 후 갱신할 파일

1. 해당 디렉터리의 `index.md` 목록에 항목을 추가한다.
2. `knowledge/log.md` 맨 위에 오늘 날짜(`## YYYY-MM-DD`) 섹션을 만들어 변경 내역을 남긴다.

## 파일명 규칙

- 소문자, 하이픈 구분. decision은 `YYYY-MM-<주제>.md` 형식을 사용한다.
- `index.md`와 `log.md`는 예약 파일명이므로 concept 이름으로 쓰지 않는다.
