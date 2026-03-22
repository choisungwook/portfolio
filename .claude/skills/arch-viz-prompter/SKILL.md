---
name: arch-viz-prompter
description: >
  Generate optimized prompts for AI-powered architecture visualization tools.
  Takes markdown, sentences, or technical context as input and produces
  ready-to-use prompts for two tools: (1) NotebookLM Infographic,
  (2) Image Prompt (for AI image generators like Gemini).
  Includes 6 curated color palettes (3 dark, 3 light) the user picks from
  before prompt generation. Use this skill whenever the user wants to create
  any kind of architecture diagram, infrastructure visualization, system
  diagram, or technical illustration — especially for blog posts or
  presentations. Even if the user just asks to "visualize this" or "make a
  diagram" for technical content, use this skill to generate the prompts.
  Triggers on: 'architecture diagram', 'arch diagram', 'infographic',
  'visualize architecture', 'draw architecture', 'architecture image',
  'NotebookLM prompt', 'image prompt', '아키텍처 그림', '아키텍처 시각화',
  '인포그래픽', 'make me a diagram', '프롬프트 만들어줘',
  'visualization prompt', 'blog diagram', '블로그 그림',
  or any request to visualize technical infrastructure or system architecture.
---

# Architecture Visualization Prompt Generator

Generate prompts for AI visualization tools that turn architecture descriptions into diagrams and illustrations for tech blog posts. The user provides technical context — markdown, sentences, or an architecture description — and this skill outputs two tailored prompts with a design palette they choose.

## Prerequisites

- **NotebookLM**: The user has AWS Architecture Icon Pack images added as a source in their NotebookLM notebook, so prompts can reference AWS icons directly.
- **Image generator**: Any AI image generation tool (e.g., Google Gemini). No pre-loaded sources required.

## Workflow

1. Read the user's input (markdown, text, or context)
2. Identify the core architecture components, relationships, and data flows
3. Present the 6 design palettes and ask the user to pick one
4. Generate two prompts — one per tool — using the selected palette
5. Present both prompts clearly separated

## Design Palette Selection

Before generating any prompts, present all 6 palettes and ask the user to choose. Consistent color theming across infographics and images creates a cohesive visual identity for blog posts — picking the palette first avoids going back and redoing work later.

Present the selection exactly like this:

```
어떤 디자인 팔레트를 사용할까요?

**Dark Mode (프리미엄, 차분한 느낌)**
  A) Warm Editorial Dark — Background: #171411, Surface: #221D19, Text: #F3EEE7, Secondary: #B9ADA1, Accent: #C9865C
  B) Neutral Warm Dark — Background: #121212, Surface: #1E1A17, Text: #F5F1EA, Secondary: #AFA59A, Accent: #B87952
  C) Charcoal Warm Dark — Background: #1A1816, Surface: #26211D, Text: #EEE7DD, Secondary: #9F9488, Accent: #D29A6A

**Light Mode (깔끔하고 밝은 느낌)**
  D) Warm White Editorial — Background: #FFFFFF, Surface: #F6F1EC, Text: #2A221D, Secondary: #7E7064, Accent: #C9865C
  E) Refined Corporate Light — Background: #FFFFFF, Surface: #F3EEEA, Text: #241F1B, Secondary: #786D63, Accent: #B87952
  F) Soft Editorial Light — Background: #FFFFFF, Surface: #F8F3EE, Text: #2D2621, Secondary: #85786D, Accent: #D29A6A

A~F 중 하나를 선택해주세요:
```

If the user has already chosen a palette in a previous interaction, reuse it without asking again — unless they explicitly ask to change it.

### Palette Reference

All 6 palettes share a common design philosophy: warm neutral base with muted accents. The tone feels premium, calm, and editorial. Avoid neon cyan, bright purple, and saturated corporate blue — these break the aesthetic.

**Palette A — Warm Editorial Dark**
The warmest dark option. Luxury brand document on a dark canvas. Best for keynote-style hero images.

- Background: `#171411` / Surface: `#221D19` / Primary text: `#F3EEE7` / Secondary text: `#B9ADA1` / Accent: `#C9865C`

**Palette B — Neutral Warm Dark**
Slightly more restrained than A. A good all-rounder for dark-mode blog posts.

- Background: `#121212` / Surface: `#1E1A17` / Primary text: `#F5F1EA` / Secondary text: `#AFA59A` / Accent: `#B87952`

**Palette C — Charcoal Warm Dark**
Softest accent of the dark trio. Use when the diagram itself should draw attention, not the color.

- Background: `#1A1816` / Surface: `#26211D` / Primary text: `#EEE7DD` / Secondary text: `#9F9488` / Accent: `#D29A6A`

**Palette D — Warm White Editorial**
A의 light 전환. White canvas with the most warmth. Premium proposal / brand document feel.

- Background: `#FFFFFF` / Surface: `#F6F1EC` / Primary text: `#2A221D` / Secondary text: `#7E7064` / Accent: `#C9865C`

**Palette E — Refined Corporate Light**
B의 light 전환. Warm but restrained. Works well for technical presentations and product docs.

- Background: `#FFFFFF` / Surface: `#F3EEEA` / Primary text: `#241F1B` / Secondary text: `#786D63` / Accent: `#B87952`

**Palette F — Soft Editorial Light**
C의 light 전환. Brightest and softest accent. Good for startup / service landing page aesthetics.

- Background: `#FFFFFF` / Surface: `#F8F3EE` / Primary text: `#2D2621` / Secondary text: `#85786D` / Accent: `#D29A6A`

## Prompt Templates

### 1. NotebookLM Infographic Prompt

Purpose: Single-page visual summary with icons, arrows, and labels. Best for blog hero images or concept overviews.

```
Generate an infographic-style architecture diagram with the following requirements:

TOPIC: {topic title}

COMPONENTS:
{bulleted list of components with brief role description}

LAYOUT:
- Arrange components in a {left-to-right / top-to-bottom / layered} flow
- Group related components visually (e.g., draw a boundary box around {group name})
- Use AWS architecture icons from the uploaded icon pack for: {list AWS services}

CONNECTIONS:
{numbered list of connections with arrow direction and label}

STYLE:
- Background color: {palette background}
- Surface/card color: {palette surface}
- Primary text color: {palette primary text}
- Secondary text/labels: {palette secondary text}
- Accent color for arrows, highlights, borders: {palette accent}
- Use surface-colored boundary boxes with accent-colored borders to separate logical groups
- Arrow labels should be concise (2-4 words)
- Include a title at the top: "{diagram title}"
- Font: sans-serif, readable at blog-post size
- Overall feel: premium, calm, editorial

ANNOTATIONS:
- Add a numbered callout for: {key insight or important note}
```

Guidance for this prompt:

- List AWS services explicitly so NotebookLM can match them to uploaded icons
- Specify boundary boxes for VPC, subnet, AZ, on-premise zones
- Keep labels short — this is a visual, not a document
- Apply the selected palette colors consistently across all visual elements

### 2. Image Prompt

Purpose: Stylized single-image architecture illustration. Best for blog thumbnails, social media images, or standalone diagrams generated by AI image tools (e.g., Google Gemini).

```
Create a technical architecture diagram illustration:

{Describe the scene in natural language, e.g., "A cloud infrastructure diagram showing a client on the left sending requests through a load balancer to three application servers, which connect to a database on the right."}

Requirements:
- Style: Clean, modern, flat-design technical illustration
- Color palette:
  - Background: {palette background}
  - Card/surface areas: {palette surface}
  - Primary text: {palette primary text}
  - Secondary text: {palette secondary text}
  - Accent for arrows, highlights, key elements: {palette accent}
- Components should be represented as labeled rounded rectangles or recognizable icons
- Use directional arrows (in accent color) to show data flow
- Include a clear title text: "{title}" at the top
- The diagram should read {left-to-right / top-to-bottom}
- Overall tone: premium, calm, editorial — no neon colors or saturated corporate blue
- Suitable for embedding in a technical blog post
- No photorealistic elements — keep it diagrammatic and clean
```

Guidance for this prompt:

- Describe the architecture as a visual scene in natural language — image generators work best with descriptive prose, not structured lists
- Specify "flat-design" and "diagrammatic" to prevent photorealistic output
- Include the full palette specification so colors stay consistent with the infographic
- The "no photorealistic elements" instruction prevents the generator from drifting into 3D renders

## Adapting Input to Prompts

When converting the user's input into prompts:

1. **Extract components**: Identify all services, servers, databases, clients, networks mentioned
2. **Map relationships**: Determine what connects to what and the direction of data/request flow
3. **Identify groups**: Cluster components by logical boundary (VPC, subnet, AZ, on-premise, cloud)
4. **Determine layout**: Choose left-to-right for request flows, top-to-bottom for layered architectures, hub-spoke for central services
5. **Apply palette**: Substitute the chosen palette's hex values into every color reference in both prompts
6. **AWS service mapping**: If AWS services are mentioned, list them explicitly for NotebookLM icon matching. Common mappings:
   - EKS/Kubernetes → Amazon EKS icon
   - RDS/Database → Amazon RDS icon
   - ALB/Load Balancer → Elastic Load Balancing icon
   - S3 → Amazon S3 icon
   - VPC → Amazon VPC icon
   - EC2 → Amazon EC2 icon
   - CloudFront → Amazon CloudFront icon
   - Route 53 → Amazon Route 53 icon
   - IAM → AWS IAM icon
   - TGW → AWS Transit Gateway icon
   - Site-to-Site VPN → AWS Site-to-Site VPN icon

## Output Format

Present prompts with clear headers:

```
## 선택된 팔레트: {Letter} — {Palette Name}

## NotebookLM Infographic Prompt
{prompt with palette colors applied}

## Image Prompt
{prompt with palette colors applied}
```

If the user specifies only one tool, generate only that prompt.
