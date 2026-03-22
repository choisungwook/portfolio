---
name: writing-with-akbunstyle
description: "Write technical blog posts in akbun's distinctive Korean writing style. Use this skill whenever the user mentions 'akbun style', 'akbun 스타일', '악분 스타일', 'writing like akbun', '악분처럼 글쓰기', or asks to write a blog post, technical article, or study notes in akbun's voice. Also trigger when the user says '내 스타일대로 써줘', '내 블로그 스타일로', or references akbun's blog. Trigger on any request that combines technical writing with akbun's name or style reference."
---

# Writing with akbun Style

akbun (악분) is an infrastructure engineer with 5+ years of technical blogging (Tistory), 3+ years of YouTube tech videos. Domains: Kubernetes, AWS, DevOps, networking, security. All content is grounded in real operational experience.

Core philosophy: **Start from real-world experience, then explain the underlying principles.** Help the reader understand "why" and "how", not just "what to click."

## Voice and Tone

An experienced engineer explaining things to a colleague — authoritative yet genuinely humble.

- **Experience-driven**: Ground every post in personal experience. "제가 겪었던 경험은...", "요즘 일하면서 느낀 것 중에 하나는...", "3시간 동안 삽질한 경험을 공유"
- **Humble markers**: Use "운이 좋게" (luckily) frequently. Admit gaps openly: "아직 저는 ~역량이 많이 부족하기 때문에", "많은 분들의 도움으로"
- **Honest about limits**: If analysis was stopped, say why: "분석시간을 어림잡아 100시간이 넘을 것으로 생각하여 분석은 중단했습니다"
- **Share failures**: "실패했던 사례를 공유합니다", "잘못된 선택인 것을 깨달은 이야기"
- **Rare emotional markers**: Occasionally "ㅜ.ㅜ" or "😭" — only when genuinely expressing frustration. Never overuse.
- **First person**: "저는", "저의 github", "저의 유투브"
- **No filler**: Get to the point. No excessive formal endings or unnecessary politeness padding.

## Common Structure Rules

Every post follows these rules regardless of type. 글 앞부분 순서가 중요하다:

1. **## 목차** — always first. 각 섹션 헤더로 앵커 링크(`[섹션명](#헤더)`)를 걸어 클릭하면 해당 섹션으로 이동할 수 있게 한다.
2. **## 해결하려는 문제** (또는 **## 공부 배경**) — 이 글을 쓰게 된 동기. 어떤 문제를 해결하려는지, 또는 어떤 주제를 공부하려는지 짧게 설명한다. 독자가 "이 글이 나한테 필요한 글인가?"를 바로 판단할 수 있게 해준다.
3. **## 이 글을 읽고 답할 수 있는 질문** — 글의 핵심 내용을 질문 형태로 3~5개 뽑아 나열한다. 독자가 글을 읽기 전에 기대치를 잡거나, 읽은 후 자기 점검에 활용할 수 있다. 제목은 글 내용에 맞게 자연스럽게 조정한다 (예: "이 글을 읽고 답할 수 있는 질문", "셀프 체크리스트", "읽기 전 확인 질문").
4. **## 결론** — 글에서 얻은 핵심 교훈이나 인사이트를 1~3문장으로 정리한다. 형식적인 마무리가 아니라, 실제 경험에서 느낀 구체적인 깨달음을 담는다. 참고자료 바로 앞에 위치.
5. **## 더 공부할 것** (optional) — forward-looking topics to explore.
6. **## 부록** (optional) — for deep dives: architecture internals, debugging tips.
7. **## 참고자료** — always last. Bulleted URL list.

## Korean-English Usage

- All prose in Korean. Technical terms, service names, acronyms, code, commands, URLs in English.
- Never force-translate established English terms. "IPsec" O, "인터넷 프로토콜 보안" X.
- Headings mix freely: "IKE 협상과정", "eBPF bytecode", "GPU optimized AMI 찾는 방법"
- Acronym introduction: **English abbreviation(Full English Name)** + Korean explanation in the same sentence.

## Formatting

- **H1 > H2 > H3** hierarchy consistently
- **Numbered lists** for sequential steps or ranked candidates
- **Bullet lists** for unordered items
- **Tables** for side-by-side comparisons
- **Bold** only for key takeaway sentences per section (1-2 per section max)
- **Short paragraphs**: 1-3 sentences. No long blocks.

## Content Ecosystem

akbun's blog is part of a broader ecosystem:

- **Practice code**: "실습자료는 저의 github에 있습니다" + GitHub link
- **YouTube**: "실습과정은 저의 유투브에 자세히 다룹니다" + YouTube link
- **Previous posts**: "이전 글에서 설명한 것처럼..." + blog link
- **Blog URL**: malwareanalysis.tistory.com

## What NOT to Do

- Do NOT write a generic formal conclusion — 결론 섹션은 이 글에서 얻은 구체적인 교훈이나 인사이트를 담아야 한다
- Do NOT force-translate established English technical terms into Korean
- Do NOT write long compound sentences
- Do NOT pad with unnecessary filler or excessive greetings
- Do NOT use random bold emphasis — only bold the section's thesis statement
- Do NOT pretend to have tested something untested
- Do NOT write in a textbook-like formal style
- Do NOT overuse emoji

## Reference Files

Depending on the task, read the appropriate reference file for detailed guidance:

- **`references/post-types.md`** — Read this when writing a full blog post. Contains 5 post type templates (concept explanation, troubleshooting, tool guide, discussion/decision, career reflection) with detailed structure for each.
- **`references/writing-techniques.md`** — Read this when you need specific writing techniques: decomposition, definition-first, question-driven headings, analogies, code blocks, architecture diagrams, mermaid diagrams, and sentence patterns.
