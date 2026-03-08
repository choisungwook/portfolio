# Icon Catalog

Icon assets are stored in `~/.claude/skills/akbun-diagram/assets/`.
All icons are PNG format. Use the filename below with the appropriate directory prefix.

## AWS Icons (`assets/aws/`)

### Compute
| Service | Filename | Display Size |
|---------|----------|--------------|
| EC2 | `Arch_Amazon-EC2_64.png` | 64×64 |
| EC2 Auto Scaling | `Arch_Amazon-EC2-Auto-Scaling_64.png` | 64×64 |
| Lambda | `Arch_AWS-Lambda_64.png` | 64×64 |

### Networking & CDN
| Service | Filename | Display Size |
|---------|----------|--------------|
| VPC | `Arch_Amazon-Virtual-Private-Cloud_64.png` | 64×64 |
| Elastic Load Balancing (ALB/NLB) | `Arch_Elastic-Load-Balancing_64.png` | 64×64 |
| CloudFront | `Arch_Amazon-CloudFront_64.png` | 64×64 |
| Route 53 | `Arch_Amazon-Route-53_64.png` | 64×64 |
| API Gateway | `Arch_Amazon-API-Gateway_64.png` | 64×64 |
| Transit Gateway | `Arch_AWS-Transit-Gateway_64.png` | 64×64 |
| Direct Connect | `Arch_AWS-Direct-Connect_64.png` | 64×64 |
| NAT Gateway | `Res_Amazon-VPC_NAT-Gateway_48.png` | 48×48 |
| Internet Gateway | `Res_Amazon-VPC_Internet-Gateway_48.png` | 48×48 |

### Containers
| Service | Filename | Display Size |
|---------|----------|--------------|
| EKS | `Arch_Amazon-Elastic-Kubernetes-Service_64.png` | 64×64 |
| ECS | `Arch_Amazon-Elastic-Container-Service_64.png` | 64×64 |
| ECR | `Arch_Amazon-Elastic-Container-Registry_64.png` | 64×64 |
| Fargate | `Arch_AWS-Fargate_64.png` | 64×64 |

### Database
| Service | Filename | Display Size |
|---------|----------|--------------|
| RDS | `Arch_Amazon-RDS_64.png` | 64×64 |
| Aurora | `Arch_Amazon-Aurora_64.png` | 64×64 |
| DynamoDB | `Arch_Amazon-DynamoDB_64.png` | 64×64 |
| ElastiCache | `Arch_Amazon-ElastiCache_64.png` | 64×64 |

### Storage
| Service | Filename | Display Size |
|---------|----------|--------------|
| S3 | `Arch_Amazon-Simple-Storage-Service_64.png` | 64×64 |
| EBS | `Arch_Amazon-Elastic-Block-Store_64.png` | 64×64 |
| EFS | `Arch_Amazon-EFS_64.png` | 64×64 |

### Security
| Service | Filename | Display Size |
|---------|----------|--------------|
| IAM Identity Center | `Arch_AWS-IAM-Identity-Center_64.png` | 64×64 |

---

## Kubernetes Icons (`assets/kubernetes/`)

All Kubernetes icons are 256×256px. Display at 64×64 in diagrams.

### Workloads
| Resource | Filename |
|----------|----------|
| Pod | `pod-256.png` |
| Deployment | `deploy-256.png` |
| StatefulSet | `sts-256.png` |
| DaemonSet | `ds-256.png` |
| ReplicaSet | `rs-256.png` |
| CronJob | `cronjob-256.png` |
| Job | `job-256.png` |

### Networking
| Resource | Filename |
|----------|----------|
| Service | `svc-256.png` |
| Ingress | `ing-256.png` |
| NetworkPolicy | `netpol-256.png` |

### Config & Storage
| Resource | Filename |
|----------|----------|
| ConfigMap | `cm-256.png` |
| Secret | `secret-256.png` |
| PersistentVolume | `pv-256.png` |
| PersistentVolumeClaim | `pvc-256.png` |

### Organization & Access
| Resource | Filename |
|----------|----------|
| Namespace | `ns-256.png` |
| ServiceAccount | `sa-256.png` |
| Role | `role-256.png` |
| HorizontalPodAutoscaler | `hpa-256.png` |

### Infrastructure
| Resource | Filename |
|----------|----------|
| Node | `node-256.png` |
| Master | `master-256.png` |
| Control Plane | `control-plane-256.png` |
| etcd | `etcd-256.png` |

### Control Plane Components
| Component | Filename |
|-----------|----------|
| API Server | `api-256.png` |
| Kubelet | `kubelet-256.png` |
| Scheduler | `sched-256.png` |
| Controller Manager | `c-m-256.png` |
| kube-proxy | `k-proxy-256.png` |

---

## Icon Embedding Workflow

To embed an icon in the Excalidraw `files` section:

```bash
# 1. Get base64 of the icon
base64 -i ~/.claude/skills/akbun-diagram/assets/aws/Arch_Amazon-EC2_64.png
```

Then add to `files`:
```json
"<fileId>": {
  "mimeType": "image/png",
  "id": "<fileId>",
  "dataURL": "data:image/png;base64,<base64-string>",
  "created": 1700000000000,
  "lastRetrieved": 1700000000000
}
```

And add an image element:
```json
{
  "id": "<element-id>",
  "type": "image",
  "x": 100,
  "y": 100,
  "width": 64,
  "height": 64,
  "fileId": "<fileId>",
  "status": "saved",
  "scale": [1, 1],
  "angle": 0,
  "opacity": 100,
  "strokeColor": "transparent",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 1,
  "version": 1,
  "versionNonce": 1,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1700000000000,
  "link": null,
  "locked": false
}
```
