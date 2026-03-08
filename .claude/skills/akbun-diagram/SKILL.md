---
name: akbun-diagram
description: This skill should be used when the user asks to draw, create, or generate an architecture diagram. Triggers on requests like "draw a diagram", "create a diagram", "그려줘", "다이어그램 만들어줘", "아키텍처 그려줘", "AWS VPC 그려줘", "kubernetes 구조 그려줘", "HA 구조 그려줘", or any request to visualize IT infrastructure, AWS architecture, Kubernetes cluster, network topology, or system design. Outputs a valid Excalidraw JSON file (.excalidraw) with embedded icons.
---

# Akbun Diagram Skill

To generate clean, simple IT architecture diagrams in Excalidraw format for DevOps engineers. The target audience is IT engineers familiar with Kubernetes, AWS, and system architecture.

## Principles

- Keep diagrams simple and clear — structure must be immediately readable
- **Rectangles are the primary building block** — any logical grouping (VPC, AZ, Subnet, Cluster, Zone, Region, Namespace, Service Mesh, Data Center, etc.) is drawn as a rectangle, regardless of the cloud/platform
- Use official icons from skill assets when available; fall back to labeled rectangles when no icon exists
- Use straight arrows to show traffic flow (roughness: 0, clean style)
- Label every component with a text element (inside or below the element)
- Prefer horizontal layout (left-to-right traffic flow) or top-to-bottom as appropriate

## Component Rendering Rules

### When to use an icon (image element)
Use an icon only when the exact service is available in the skill assets:
- AWS services → `assets/aws/`
- Kubernetes resources → `assets/kubernetes/`

Place a text label below the icon (offset +8px from icon bottom).

### When to use a rectangle (no icon)
Use a **styled rectangle + text label** for everything else:
- Any grouping boundary (VPC equivalent in non-AWS clouds, data center, zone, region, network segment)
- Any service with no icon in assets (e.g., on-premise server, custom app, generic database)
- Any platform-agnostic component (message queue, cache, proxy, firewall)

The rectangle itself communicates the component's role through its color and label. Place the label inside the rectangle (top-left corner for containers, center for leaf nodes).

**Examples using rectangles:**
- GCP VPC → rectangle with label "VPC" (same purple as AWS VPC)
- On-premise data center → rectangle with label "On-Premise DC"
- Generic web server → small rectangle with label "Web Server\nnginx"
- Message queue → small rectangle with label "Kafka Queue"
- Firewall → small rectangle with label "Firewall"

## Workflow

### Step 1: Understand the request

Analyze what diagram is needed. Identify the diagram type:
- **AWS architecture**: Use AWS icons where available, rectangles for everything else
- **Kubernetes**: Use K8s icons where available, rectangles for groupings (cluster, AZ, node pools)
- **Multi-cloud / on-premise**: Use rectangles as the primary element; add icons only when they exist in assets
- **HA architecture**: Multi-AZ or multi-region with load balancing and failover
- **Software/CS**: Custom component diagrams (queues, databases, services, APIs) — all rectangles

### Step 2: Plan the layout

Design the diagram layout on a grid (200px unit spacing):
- Container rectangles (VPC, AZ, Namespace, DC, Zone): large rectangles, label in top-left corner
- Leaf node rectangles (service, app, DB with no icon): medium rectangles 120×60px, label centered
- Icons (when available): 64×64px (AWS) or 64×64px (K8s), with label below
- Arrows: connect components showing traffic/data flow direction

### Step 3: Select rendering method per component

For each component in the diagram, decide:

1. **Icon available in assets?** → Use image element + label text below
2. **No icon?** → Use rectangle element with label text inside (centered or top-left)

Use the icon catalog in `references/icon-catalog.md` to check availability.
Icon assets are at `~/.claude/skills/akbun-diagram/assets/`

To base64-encode an icon when needed:
```bash
base64 -i ~/.claude/skills/akbun-diagram/assets/aws/Arch_Amazon-EC2_64.png
```

### Step 4: Generate Excalidraw JSON

Output a complete `.excalidraw` file. See `references/excalidraw-format.md` for the full spec.

Key rules:
- Every element needs a unique `id` (use short descriptive IDs like "vpc-box", "ec2-icon", "alb-label")
- `roughness: 0` for clean professional look
- `strokeWidth: 2` for containers, `strokeWidth: 1` for icons/labels
- Container elements must appear before their child elements in the array (z-order)
- Save the file as `diagram-<topic>.excalidraw` in the current directory

### Step 5: Output the file

Write the complete Excalidraw JSON to a file. Also print a brief summary of what was drawn.

## Design System

### Colors

| Element | strokeColor | backgroundColor |
|---------|-------------|-----------------|
| AWS Cloud region box | `#AAB7B8` | `#F2F3F3` |
| VPC container | `#8C4FFF` | `#F5F0FF` |
| Public subnet | `#00A1C9` | `#E6F7FB` |
| Private subnet | `#1D8102` | `#F0F9EC` |
| EC2 / Compute | `#E07941` | `#FDEBD0` |
| Database | `#3F48CC` | `#EEF0FB` |
| Kubernetes cluster | `#326CE5` | `#EBF2FF` |
| Kubernetes namespace | `#326CE5` | `#F0F5FF` |
| Kubernetes node | `#5C7CFA` | `#F5F7FF` |
| Generic component box | `#1e1e1e` | `#ffffff` |
| Generic grouping/zone | `#AAB7B8` | `#F8F8F8` |
| On-premise / DC | `#5D4037` | `#EFEBE9` |
| Application / Service | `#546E7A` | `#ECEFF1` |
| Queue / Event bus | `#6A1B9A` | `#F3E5F5` |
| Cache | `#00838F` | `#E0F7FA` |
| Arrow / connection | `#1e1e1e` | `transparent` |

### Typography

- Container labels (VPC, Subnet): fontSize 14, fontFamily 1 (Virgil), bold via fontWeight not supported — use ALL CAPS
- Icon labels: fontSize 13, fontFamily 1, textAlign "center"
- Title: fontSize 20, fontFamily 1, placed top-left of diagram

### Arrow style

```json
{
  "type": "arrow",
  "strokeColor": "#1e1e1e",
  "strokeWidth": 1.5,
  "roughness": 0,
  "startArrowhead": null,
  "endArrowhead": "arrow"
}
```

## Common Diagram Patterns

See `references/layout-patterns.md` for full layout templates for:
- AWS VPC with public/private subnets
- Kubernetes cluster with nodes and namespaces
- Multi-AZ HA architecture
- 3-tier web application
