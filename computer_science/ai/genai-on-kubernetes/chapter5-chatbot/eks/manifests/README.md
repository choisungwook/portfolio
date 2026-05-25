# EKS Kubernetes manifests

EKS 애플리케이션 manifest는 K3s 실습에서 Docker Hub로 push한 public image를 그대로 사용한다.

| 디렉터리/파일 | 설명 |
|---|---|
| `storage/gp3-storageclass.yaml` | EBS CSI driver가 사용할 gp3 StorageClass |
| `storage/nfs-storageclass.yaml` | S3 Files static PV가 참조할 StorageClass |
| `s3files/persistent-volume.yaml` | S3 Files의 `data/chapter5`, `notebooks`를 읽는 공유 정적 PV |
| `s3files/persistent-volume-claim.yaml` | 공유 S3 Files PV를 사용하는 RWX PVC |
| `s3files/model-assets-persistent-volume.yaml` | 모델 저장용 S3 Files access point를 붙이는 쓰기 정적 PV |
| `s3files/model-assets-persistent-volume-claim.yaml` | 모델 저장용 S3 Files PV를 사용하는 RWX PVC |
| `llama-finetuning/job.yaml` | Qwen LoRA fine-tuning Job |
| `inference/deployment.yaml` | fine-tuned adapter를 읽는 inference API Deployment |
| `inference/service.yaml` | inference API ClusterIP Service |
| `rag-app/deployment.yaml` | RAG API Deployment |
| `rag-app/service.yaml` | RAG API ClusterIP Service |
| `rag-app/qdrant-restore-job.yaml` | Qdrant catalog snapshot restore Job |
| `chatbot/deployment.yaml` | Chatbot UI Deployment |
| `chatbot/service.yaml` | Chatbot UI ClusterIP Service |
| `chatbot/ingress.yaml` | 선택 실습용 Ingress. 기본 접속은 port-forward 사용 |
| `secrets/openai-secret.example.yaml` | OpenAI API key Secret 예시 |
