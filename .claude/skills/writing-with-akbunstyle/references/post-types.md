# Post Types and Structure Templates

akbun writes 5 distinct post types. Identify which type fits the topic, then follow that template.

모든 post type은 SKILL.md의 Common Structure Rules에 정의된 앞부분 순서(목차 → 해결하려는 문제/공부 배경 → 이 글을 읽고 답할 수 있는 질문)를 따른다. 아래 템플릿은 그 공통 앞부분 이후의 본문 구조를 정의한다.

## Type 1: Concept Explanation (개념 설명)

Topics like mTLS, eBPF, lease API, Site to Site VPN.

```
1. ## 목차
2. ## 공부 배경 — 이 개념을 왜 공부하게 되었는지
3. ## 이 글을 읽고 답할 수 있는 질문
4. Core concept definition (use decomposition technique from writing-techniques.md)
5. Detailed analysis / how it works
6. 주의사항 / 헷갈리면 안되는 점 (caveats)
7. 실습 — brief, link to GitHub
8. ## 결론 — 핵심 교훈/인사이트 1~3문장
9. ## 참고자료 — URL list only
```

Key traits:

- Use the decomposition technique only when the compound term genuinely benefits from being broken into sub-parts (see writing-techniques.md for when to use vs. skip)
- Include a caveats section addressing common misunderstandings
- Bold the core definition statement

## Type 2: Incident / Troubleshooting Story (트러블슈팅 이야기)

Service outages, health check failures, performance issues. **akbun's most distinctive post type.**

```
1. ## 목차
2. ## 해결하려는 문제 — 어떤 장애/이슈가 발생했는지
3. ## 이 글을 읽고 답할 수 있는 질문
4. Vivid scene-setting ("아침 7시 40분쯤 메신저에서 긴급이라는 메세지가 보였습니다")
5. Architecture diagram of the affected environment
6. Investigation process — what was checked, what was ruled out
7. Root cause — bolded key finding
8. Resolution
9. Lessons Learned (optional)
10. ## 결론 — 핵심 교훈/인사이트 1~3문장
11. ## 참고자료
```

Key traits:

- Open with a vivid scene: time, place, the alert message
- Walk through the investigation step by step — what was checked, what was ruled out
- Bold the root cause statement
- Include architecture diagrams showing the affected environment

## Type 3: Tool / How-To Guide (도구 사용법)

Tools like nvidia-smi, k6, LM studio, obsidian plugins.

```
1. ## 목차
2. ## 해결하려는 문제 — 이 도구가 필요한 상황/문제
3. ## 이 글을 읽고 답할 수 있는 질문
4. Tool introduction (1-2 sentences)
5. Installation
6. Usage — alternating pattern of command + screenshot
7. ## 결론 — 핵심 교훈/인사이트 1~3문장
8. ## 참고자료
```

Key traits:

- Brief tool intro, no lengthy background
- Alternate between command/code and result description
- Keep each step concise

## Type 4: Discussion / Decision Story (토론/의사결정)

Team discussions, comparing options, realizing a wrong choice.

```
1. ## 목차
2. ## 해결하려는 문제 — 왜 이 논의가 시작되었는지
3. ## 이 글을 읽고 답할 수 있는 질문
4. Background situation
5. Candidate list with pros/cons
6. Chosen conclusion
7. Why that choice was wrong (the twist)
8. Final conclusion
9. ## 결론 — 핵심 교훈/인사이트 1~3문장
10. ## 참고자료
```

Key traits:

- Present candidates with numbered list and pros/cons
- The twist — why the chosen option was wrong — is the core narrative hook
- End with the real lesson learned, not just the final choice

## Type 5: Career Reflection (커리어 회고)

Personal career story, growth by year. Chronological narration.

```
1. ## 목차
2. ## 공부 배경 — 회고를 쓰게 된 계기
3. ## 이 글을 읽고 답할 수 있는 질문
4. Year-by-year narrative
5. Key turning points and lessons
6. ## 결론 — 핵심 교훈/인사이트 1~3문장
7. ## 참고자료
```

Key traits:

- Honest, reflective tone
- Share both successes and failures
- Use humble markers naturally throughout
