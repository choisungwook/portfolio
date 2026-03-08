# Excalidraw File Format Reference

## Top-level Structure

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [],
  "appState": {
    "gridSize": null,
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

## Element Types

### Rectangle (containers, boxes)

```json
{
  "id": "vpc-box",
  "type": "rectangle",
  "x": 50,
  "y": 50,
  "width": 900,
  "height": 600,
  "angle": 0,
  "strokeColor": "#8C4FFF",
  "backgroundColor": "#F5F0FF",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": {"type": 3},
  "seed": 100,
  "version": 1,
  "versionNonce": 100,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1700000000000,
  "link": null,
  "locked": false
}
```

### Text (labels, titles)

```json
{
  "id": "vpc-label",
  "type": "text",
  "x": 65,
  "y": 58,
  "width": 120,
  "height": 20,
  "angle": 0,
  "strokeColor": "#8C4FFF",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 101,
  "version": 1,
  "versionNonce": 101,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1700000000000,
  "link": null,
  "locked": false,
  "text": "VPC (10.0.0.0/16)",
  "fontSize": 14,
  "fontFamily": 1,
  "textAlign": "left",
  "verticalAlign": "top",
  "baseline": 12,
  "containerId": null,
  "originalText": "VPC (10.0.0.0/16)",
  "lineHeight": 1.25
}
```

### Image (service icons)

```json
{
  "id": "ec2-icon",
  "type": "image",
  "x": 200,
  "y": 200,
  "width": 64,
  "height": 64,
  "angle": 0,
  "strokeColor": "transparent",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 200,
  "version": 1,
  "versionNonce": 200,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1700000000000,
  "link": null,
  "locked": false,
  "fileId": "ec2-file-id",
  "status": "saved",
  "scale": [1, 1]
}
```

### Arrow (connections, traffic flow)

```json
{
  "id": "flow-arrow",
  "type": "arrow",
  "x": 300,
  "y": 232,
  "width": 136,
  "height": 0,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1.5,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": {"type": 2},
  "seed": 300,
  "version": 1,
  "versionNonce": 300,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1700000000000,
  "link": null,
  "locked": false,
  "points": [[0, 0], [136, 0]],
  "lastCommittedPoint": null,
  "startBinding": null,
  "endBinding": null,
  "startArrowhead": null,
  "endArrowhead": "arrow"
}
```

### Dashed Arrow (optional/secondary connections)

Same as arrow but with `"strokeStyle": "dashed"`.

## files Section

The `files` object embeds icon images as base64:

```json
"files": {
  "ec2-file-id": {
    "mimeType": "image/png",
    "id": "ec2-file-id",
    "dataURL": "data:image/png;base64,iVBORw0KGgo...",
    "created": 1700000000000,
    "lastRetrieved": 1700000000000
  }
}
```

## Coordinate System

- Origin (0,0) is top-left
- X increases right, Y increases down
- Leave 50px margin around the outer edge
- Use 200px spacing between major components
- Use 100-150px between icon and next component in same row

## Layout Grid

Recommended spacing for clean diagrams:

```
Outer margin:        50px from canvas edge
Container padding:   20px inside container
Icon size (AWS):     64×64px
Icon size (K8s):     64×64px (rendered from 256px source)
Label offset:        8px below icon bottom
Component spacing:   120-150px center-to-center horizontally
Row spacing:         150-200px center-to-center vertically
Container min size:  200×150px
```

## Element Ordering

Elements in the `elements` array are rendered back-to-front:
1. Background/outer containers first (AWS Cloud box, Region box)
2. Inner containers (VPC, AZ, Subnet, Namespace, Node)
3. Icons (image elements)
4. Labels (text elements)
5. Arrows last (so they appear on top)

## ID Conventions

Use descriptive IDs to avoid collisions:
- `vpc-box`, `vpc-label`
- `az1-box`, `az1-label`
- `public-subnet-1`, `private-subnet-1`
- `ec2-1-icon`, `ec2-1-label`
- `alb-icon`, `alb-label`
- `arrow-igw-to-alb`, `arrow-alb-to-ec2`
- `file-ec2`, `file-rds`, `file-elb`
