# Layout Patterns

Common diagram layout templates for akbun-style architecture diagrams.

---

## Pattern 1: AWS VPC with Public/Private Subnets

**Use when**: Drawing a standard AWS VPC with internet-facing and internal resources.

```
Canvas layout (horizontal, left-to-right flow):

[AWS Cloud region - light grey]
  [VPC - purple border]
    [AZ-1 - dashed border]           [AZ-2 - dashed border]
      [Public Subnet - blue]           [Public Subnet - blue]
        IGW -> ALB -> EC2               ALB -> EC2
      [Private Subnet - green]         [Private Subnet - green]
        EC2 -> RDS (Primary)           EC2 -> RDS (Standby)
                                              ^
                                    (Multi-AZ replication)
```

**Coordinate plan (1200×700 canvas)**:

| Element | x | y | w | h |
|---------|---|---|---|---|
| AWS Cloud box | 20 | 20 | 1160 | 660 |
| AWS label | 30 | 28 | | |
| VPC box | 60 | 60 | 1080 | 580 |
| VPC label | 75 | 70 | | |
| AZ-1 box | 100 | 110 | 460 | 480 |
| AZ-2 box | 600 | 110 | 460 | 480 |
| Public subnet AZ-1 | 120 | 140 | 420 | 180 |
| Private subnet AZ-1 | 120 | 350 | 420 | 200 |
| Public subnet AZ-2 | 620 | 140 | 420 | 180 |
| Private subnet AZ-2 | 620 | 350 | 420 | 200 |
| IGW icon | 70 | 270 | 64 | 64 |
| ALB icon (AZ-1) | 210 | 195 | 64 | 64 |
| EC2 icon (AZ-1 public) | 340 | 195 | 64 | 64 |
| EC2 icon (AZ-1 private) | 210 | 390 | 64 | 64 |
| RDS primary (AZ-1) | 360 | 390 | 64 | 64 |
| ALB icon (AZ-2) | 710 | 195 | 64 | 64 |
| EC2 icon (AZ-2 public) | 840 | 195 | 64 | 64 |
| EC2 icon (AZ-2 private) | 710 | 390 | 64 | 64 |
| RDS standby (AZ-2) | 860 | 390 | 64 | 64 |

**Color assignments**:
- AWS Cloud box: stroke `#AAB7B8`, fill `#F2F3F3`
- VPC: stroke `#8C4FFF`, fill `#F5F0FF`
- AZ box: stroke `#AAB7B8` dashed, fill `transparent`
- Public subnet: stroke `#00A1C9`, fill `#E6F7FB`
- Private subnet: stroke `#1D8102`, fill `#F0F9EC`

---

## Pattern 2: Kubernetes Cluster

**Use when**: Drawing a K8s cluster with nodes, namespaces, and workloads.

```
Canvas layout:

[Kubernetes Cluster - blue border]
  [Control Plane Node]
    API Server | etcd | Scheduler | Controller Manager

  [Worker Node 1]          [Worker Node 2]
    [Namespace: app]         [Namespace: app]
      Deployment               Deployment
        Pod  Pod                 Pod  Pod
      Service                 Service
    [Namespace: monitoring]
      Deployment (Prometheus)
      Service
  Ingress (top, spanning all)
```

**Coordinate plan (1100×750 canvas)**:

| Element | x | y | w | h |
|---------|---|---|---|---|
| Cluster box | 20 | 20 | 1060 | 710 |
| Control plane box | 40 | 50 | 980 | 150 |
| API server icon | 80 | 95 | 64 | 64 |
| etcd icon | 220 | 95 | 64 | 64 |
| Scheduler icon | 360 | 95 | 64 | 64 |
| Controller Mgr icon | 500 | 95 | 64 | 64 |
| Ingress icon | 480 | 50 | 64 | 64 |
| Worker node 1 box | 40 | 220 | 460 | 480 |
| Worker node 2 box | 540 | 220 | 460 | 480 |
| Namespace app (node1) | 60 | 250 | 420 | 200 |
| Deploy icon (node1) | 100 | 290 | 64 | 64 |
| Pod icons (node1) | 200, 290 | 290 | 48, 48 | 48, 48 |
| Service icon (node1) | 380 | 290 | 64 | 64 |
| Namespace monitoring | 60 | 470 | 420 | 200 |
| Deploy icon (monitoring) | 100 | 510 | 64 | 64 |

---

## Pattern 3: Multi-AZ HA Architecture (3-tier)

**Use when**: Drawing a high-availability web application with LB, app tier, DB tier.

```
Internet -> Route53 -> CloudFront -> ALB
                                      |
                         +-----------+----------+
                    AZ-1 |                  AZ-2 |
                  App EC2 (x2)          App EC2 (x2)
                    ElastiCache           ElastiCache
                   RDS Primary  <-->   RDS Standby
```

**Flow direction**: Top-to-bottom

| Layer | y-position |
|-------|-----------|
| Internet / Users | 50 |
| DNS (Route53) | 150 |
| CDN (CloudFront) | 250 |
| Load Balancer (ALB) | 370 |
| App tier (EC2, AZ split) | 490 |
| Cache layer (ElastiCache) | 610 |
| Database layer (RDS) | 730 |

---

## Pattern 4: Simple Service Diagram (CS/Software)

**Use when**: Drawing software architecture without cloud-specific icons (queues, DBs, APIs).

Use generic shapes:
- Rectangles with labels for services
- Cylinders (ellipse + rectangle) for databases
- Parallelograms for queues (use rotated rectangle text)
- Arrows with labels for protocols/APIs

```
[Client] -> [API Gateway] -> [App Service] -> [DB]
                                    |
                               [Message Queue]
                                    |
                            [Worker Service] -> [Cache]
```

---

---

## Pattern 5: Rectangle-only Diagram (no cloud icons)

**Use when**: Drawing non-AWS/non-K8s architectures, on-premise, multi-cloud, or generic software diagrams.

All components are rectangles. The role of each component is communicated by:
1. The label (service name + optionally tech stack)
2. The color (from the design system)
3. The grouping (parent container rectangle)

```
[On-Premise DC - brown border]
  [Network Zone - grey]
    [Firewall rect]  ->  [Load Balancer rect]
                               |
                    +----------+----------+
               [App Server 1]        [App Server 2]
                    |                      |
               [Cache rect]           [Cache rect]
                    |
               [Database rect]  <-->  [DB Replica rect]

  [DMZ Zone - grey]
    [Proxy rect]
```

**Leaf node rectangle sizes**:
- Standard service: 140×60px
- Database: 140×60px (add "DB" prefix in label)
- Load balancer / proxy: 160×50px
- Large grouping container: fill available space with 20px padding

**Rectangle-only Excalidraw element example**:
```json
{
  "id": "app-server-1",
  "type": "rectangle",
  "x": 200,
  "y": 300,
  "width": 140,
  "height": 60,
  "strokeColor": "#546E7A",
  "backgroundColor": "#ECEFF1",
  "fillStyle": "solid",
  "strokeWidth": 1.5,
  "roughness": 0,
  "roundness": {"type": 3}
}
```

With a centered label:
```json
{
  "id": "app-server-1-label",
  "type": "text",
  "x": 220,
  "y": 320,
  "width": 100,
  "height": 20,
  "text": "App Server\nnginx",
  "fontSize": 12,
  "fontFamily": 1,
  "textAlign": "center",
  "verticalAlign": "middle"
}
```

---

## Pattern 6: Hybrid (AWS + On-Premise)

**Use when**: Drawing Site-to-Site VPN or Direct Connect between AWS and on-premise.

```
[On-Premise DC - brown]           [AWS Cloud - grey]
  [Firewall rect]                   [VPC - purple]
  [Router rect]    <-- VPN/DC -->     [VGW icon or rect]
  [Server rect]                       [Private Subnet]
                                        [EC2 icon]
                                        [RDS icon]
```

Use AWS icons for AWS-side components, rectangles for on-premise components.
The VPN/Direct Connect link: dashed arrow with label "Site-to-Site VPN" or "Direct Connect".

---

## Naming Conventions for Labels

| Component | Label format |
|-----------|-------------|
| VPC | `VPC (10.0.0.0/16)` |
| Subnet | `Public Subnet\n10.0.1.0/24` |
| AZ | `ap-northeast-2a` |
| EC2 | `EC2\nt3.medium` |
| RDS | `RDS MySQL\n(Primary)` |
| K8s node | `Worker Node 1` |
| Namespace | `ns: production` |
| Pod | `pod` |

Use `\n` in the text string for multi-line labels in Excalidraw.

---

## Arrow Labeling

For arrows representing specific protocols or ports, add a small text element above the midpoint of the arrow:

- HTTP/HTTPS: label `HTTPS 443`
- Database: label `MySQL 3306`
- Internal: label `TCP 8080`

Position the label at `arrow.x + arrow.width/2 - 30`, `arrow.y - 20`.
