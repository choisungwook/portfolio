---
name: arch-viz-prompter
description: "Generate optimized prompts for AI-powered architecture visualization tools. Takes markdown, sentences, or technical context as input and produces ready-to-use prompts for three tools: (1) NotebookLM Infographic, (2) NotebookLM Slides, (3) Google Gemini Nano Banana (image generation). Use this skill when the user wants to create architecture diagrams, infrastructure visualizations, system diagrams, or technical illustrations for blog posts. Trigger on: 'architecture diagram', 'arch diagram', 'infographic', 'visualize architecture', 'draw architecture', 'architecture image', 'NotebookLM prompt', 'Gemini image prompt', 'nano banana', '아키텍처 그림', '아키텍처 시각화', '인포그래픽', '슬라이드 그림', 'make me a diagram', or any request to visualize technical infrastructure or system architecture."
---

# Architecture Visualization Prompt Generator

Generate prompts for three AI visualization tools to create architecture diagrams and technical illustrations for tech blog posts. The user provides technical context (markdown, sentences, or architecture description), and this skill outputs three tailored prompts.

## Prerequisites

- **NotebookLM**: The user has AWS Architecture Icon Pack images added as a source in their NotebookLM notebook. Prompts can reference AWS icons directly.
- **Gemini Nano Banana**: Google Gemini's image generation mode. No pre-loaded sources.

## Workflow

1. Read the user's input (markdown, text, or context)
2. Identify the core architecture components, relationships, and data flows
3. Generate three prompts — one for each tool
4. Present all three prompts clearly separated

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
- Clean, minimal design with white background
- Use colored boundary boxes to separate logical groups (e.g., VPC = light blue, On-premise = light gray)
- Arrow labels should be concise (2-4 words)
- Include a title at the top: "{diagram title}"
- Font: sans-serif, readable at blog-post size

ANNOTATIONS:
- Add a numbered callout for: {key insight or important note}
```

Key rules for this prompt:

- Always list AWS services explicitly so NotebookLM can match them to uploaded icons
- Specify boundary boxes for VPC, subnet, AZ, on-premise zones
- Keep labels short — this is a visual, not a document
- Request white background for blog embedding

### 2. NotebookLM Slides Prompt

Purpose: Multi-slide breakdown. Best for step-by-step explanations, protocol flows, or before/after comparisons.

```
Create a slide deck explaining the following architecture:

TOPIC: {topic title}

SLIDE STRUCTURE:
Slide 1 - Title
- Title: "{presentation title}"
- Subtitle: "{one-line summary}"

Slide 2 - Overview Architecture
- Show the full architecture diagram with all components
- Use AWS icons from the uploaded icon pack for: {list AWS services}
- Label each component clearly

Slide 3 - {Flow/Process Name}
- Show step-by-step flow: {numbered steps}
- Use arrows to indicate direction
- Highlight the current step in each sub-diagram

Slide 4 - {Detail/Zoom-in Topic}
- Focus on: {specific component or interaction}
- Show internal details: {what to reveal}

Slide 5 - Key Takeaways
- Bullet points:
  {2-4 key takeaways}

STYLE:
- Clean, professional design
- Use AWS architecture icons from uploaded sources
- Consistent color scheme across slides
- One main idea per slide
- Minimal text — let diagrams speak
```

Key rules for this prompt:

- One concept per slide — never overload
- Explicitly number the flow steps
- Request icon usage from uploaded sources
- Include a takeaway slide for blog context

### 3. Gemini Nano Banana Prompt

Purpose: Stylized single-image architecture illustration. Best for eye-catching blog thumbnails or social media images.

```
Create a technical architecture diagram illustration:

{Describe the scene in natural language, e.g., "A cloud infrastructure diagram showing a client on the left sending requests through a load balancer to three application servers, which connect to a database on the right."}

Requirements:
- Style: Clean, modern, flat-design technical illustration
- Background: White or very light gray
- Components should be represented as labeled rounded rectangles or recognizable icons
- Use directional arrows to show data flow
- Color coding: {specify colors for different layers/groups, e.g., "blue for cloud services, green for on-premise, orange for databases"}
- Include a clear title text: "{title}" at the top
- The diagram should read {left-to-right / top-to-bottom}
- Make it suitable for embedding in a technical blog post
- Do NOT include any photorealistic elements — keep it diagrammatic and clean
```

Key rules for this prompt:

- Describe the architecture as a visual scene in natural language — Gemini works best with descriptive prose, not structured lists
- Always specify "flat-design" and "diagrammatic" to avoid photorealistic output
- Specify white/light background for blog compatibility
- Include color coding instructions for visual clarity
- Explicitly say "no photorealistic elements"

## How to Adapt Input to Prompts

When converting the user's input into prompts:

1. **Extract components**: Identify all services, servers, databases, clients, networks mentioned
2. **Map relationships**: Determine what connects to what and the direction of data/request flow
3. **Identify groups**: Cluster components by logical boundary (VPC, subnet, AZ, on-premise, cloud)
4. **Determine layout**: Choose left-to-right for request flows, top-to-bottom for layered architectures, hub-spoke for central services
5. **AWS service mapping**: If AWS services are mentioned, list them explicitly for NotebookLM icon matching. Common mappings:
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

Present all three prompts with clear headers:

```
## NotebookLM Infographic Prompt
{prompt}

## NotebookLM Slides Prompt
{prompt}

## Gemini Nano Banana Prompt
{prompt}
```

If the user specifies only one tool, generate only that prompt.
