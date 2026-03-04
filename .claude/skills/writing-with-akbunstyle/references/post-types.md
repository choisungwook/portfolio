# Post Types and Structure Templates

akbun writes 5 distinct post types. Identify which type fits the topic, then follow that template.

## Type 1: Concept Explanation (개념 설명)

Topics like mTLS, eBPF, lease API, Site to Site VPN.

```
1. # 요약 — concise bullet-point summary of key takeaways
2. # 목차 — table of contents listing all major sections
3. Core concept definition (use decomposition technique from writing-techniques.md)
4. Detailed analysis / how it works
5. 주의사항 / 헷갈리면 안되는 점 (caveats)
6. 실습 — brief, link to GitHub
7. 참고자료 — URL list only
```

Key traits:
- Use the decomposition technique to break down compound terms
- Include a caveats section addressing common misunderstandings
- Bold the core definition statement

## Type 2: Incident / Troubleshooting Story (트러블슈팅 이야기)

Service outages, health check failures, performance issues. **akbun's most distinctive post type.**

```
1. # 요약 — what happened, root cause, and resolution in 2-3 bullets
2. # 목차
3. Vivid scene-setting ("아침 7시 40분쯤 메신저에서 긴급이라는 메세지가 보였습니다")
4. Architecture diagram of the affected environment
5. Investigation process — what was checked, what was ruled out
6. Root cause — bolded key finding
7. Resolution
8. Lesson Learn (optional)
9. 참고자료
```

Key traits:
- Open with a vivid scene: time, place, the alert message
- Walk through the investigation step by step — what was checked, what was ruled out
- Bold the root cause statement
- Include architecture diagrams showing the affected environment

## Type 3: Tool / How-To Guide (도구 사용법)

Tools like nvidia-smi, k6, LM studio, obsidian plugins.

```
1. # 요약 — what this tool does and the key commands/steps in bullets
2. # 목차
3. Tool introduction (1-2 sentences)
4. Installation
5. Usage — alternating pattern of command + screenshot
6. 참고자료
```

Key traits:
- Brief tool intro, no lengthy background
- Alternate between command/code and result description
- Keep each step concise

## Type 4: Discussion / Decision Story (토론/의사결정)

Team discussions, comparing options, realizing a wrong choice.

```
1. # 요약 — the decision and lesson learned in 2-3 bullets
2. # 목차
3. Background situation
4. Why the discussion started
5. Candidate list with pros/cons
6. Chosen conclusion
7. Why that choice was wrong (the twist)
8. Final conclusion
9. 참고자료
```

Key traits:
- Present candidates with numbered list and pros/cons
- The twist — why the chosen option was wrong — is the core narrative hook
- End with the real lesson learned, not just the final choice

## Type 5: Career Reflection (커리어 회고)

Personal career story, growth by year. Chronological narration.

```
1. # 요약
2. # 목차
3. Year-by-year narrative
4. Key turning points and lessons
5. 참고자료
```

Key traits:
- Honest, reflective tone
- Share both successes and failures
- Use humble markers naturally throughout
