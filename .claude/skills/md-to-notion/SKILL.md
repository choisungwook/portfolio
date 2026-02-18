---
name: md-to-notion
description: >
  Transfer an Obsidian markdown file to a Notion "Tasks" database using the
  Notion MCP. Reads the markdown content, sets database properties (Tags,
  Start & End Date, Status), and creates a new page with the content.
  If a page with the same title already exists, asks before overwriting.
  Use this skill when the user wants to send/sync/transfer an Obsidian note
  to Notion, or copy markdown to Notion. Trigger on: "notion", "send to notion",
  "md to notion", "obsidian to notion", "transfer to notion", "sync to notion".
allowed-tools:
  - Bash(echo:*)
  - mcp__notion__notion-search
  - mcp__notion__notion-fetch
  - mcp__notion__notion-create-pages
  - mcp__notion__notion-update-page
  - mcp__notion__notion-update-data-source
---

# Markdown to Notion

## Overview

Transfer an Obsidian markdown file to the Notion "Tasks" database via Notion MCP.
The Obsidian `![[image]]` syntax is kept as plain text (Notion cannot render local images).

## Prerequisites

- Notion MCP connected in Claude Code
- `$OBSIDIAN_VAULT` environment variable set in `~/.zshrc`
- `$NOTION_TASKS_DATASOURCE_ID` environment variable set in `~/.zshrc`

## Notion Database Info

- **Database**: Tasks
- **Data Source ID**: Read from `$NOTION_TASKS_DATASOURCE_ID` environment variable

## Workflow

1. **Read** the Obsidian markdown file
2. **Parse** YAML frontmatter to extract `name`, `created` date, and `tags`
3. **Search** Notion for an existing page with the same title

- If found: **ask the user** before overwriting (use `notion-update-page` with `replace_content`)
- If not found: create a new page

1. **Create/Update** the Notion page with properties and content

## Property Mapping

| Notion Property      | Value                                                    |
|----------------------|----------------------------------------------------------|
| Name                 | **IMPORTANT**: Use Obsidian filename (without .md extension), NOT frontmatter `name` field |
| Tags                 | Auto-generated from content (use existing Notion tag options when possible) |
| Start & End Date     | Start = Obsidian `created` date, End = today's date      |
| Status               | "In progress"                                            |
| Related to Areas     | Leave empty (user sets manually)                         |
| Related Projects     | Leave empty                                              |
| Release              | Leave empty                                              |

## Property Format (for notion-create-pages)

```json
{
  "Name": "page title",
  "Tags": "[\"tag1\", \"tag2\"]",
  "Status": "In progress",
  "date:Start & End Date:start": "2026-02-15",
  "date:Start & End Date:end": "2026-02-15",
  "date:Start & End Date:is_datetime": 0
}
```

## Content Rules

- Strip YAML frontmatter (`---...---`) before sending content to Notion
- Keep Obsidian `![[image]]` syntax as-is (plain text marker)
- Keep all other markdown (headers, code blocks, lists, bold, links) as-is
- Use the Notion enhanced markdown spec (fetch `notion://docs/enhanced-markdown-spec`
  before first use if unsure about formatting)

## Line Break Rules

**IMPORTANT**: Notion automatically strips empty lines. To add visible blank lines, use `<empty-block/>` tags:

- **After paragraphs**: Add `<empty-block/>` on its own line after each paragraph
- **After code blocks**: Add `<empty-block/>` on its own line after closing ```
- **Before code blocks**: NO empty block (Notion handles spacing automatically)
- **After image markers** (`![[...]]`): Add `<empty-block/>` on its own line after each image marker

Example format:

```
Paragraph text here.
<empty-block/>
Next paragraph here.
<empty-block/>
\`\`\`bash
code here
\`\`\`
<empty-block/>
More content.
```

## Existing Tags Reference

Common tags already in the database: AI, aws, Kubernetes, EKS, terraform,
claude, tools, git, linux, ebpf, Cilium, MLOps, kubeflow, OIDC, oauth,
security, vpn, skills, notion, blog, study.
Always prefer reusing existing tags over creating new ones.
