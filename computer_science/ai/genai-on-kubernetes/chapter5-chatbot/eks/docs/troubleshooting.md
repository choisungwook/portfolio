# EKS troubleshooting

## TL;DR

- S3 Files mount 중 `access denied by server`가 나오면 compute role의 S3 Files client 권한을 먼저 확인한다.
- 이 실습에서는 EFS CSI node Pod Identity role에 `AmazonS3FilesClientFullAccess`가 필요하다.
- 권한을 추가한 뒤 IAM 전파를 기다리고 JupyterHub user server를 다시 시작한다.
- S3 Files access point를 바꿨는데 mount 결과가 그대로면 pod가 아니라 PV/PVC를 다시 만든다.

## S3 Files mount access denied

### 증상

JupyterHub singleuser pod가 S3 Files PVC를 mount할 때 다음 에러가 난다.

```text
MountVolume.SetUp failed for volume "chapter5-s3files-pv"
mount.nfs4: access denied by server while mounting 127.0.0.1:/
```

같은 이벤트에 다음 경고가 같이 나올 수 있다.

```text
Could not start amazon-efs-mount-watchdog, unrecognized init system "aws-efs-csi-dri"
```

`amazon-efs-mount-watchdog` 메시지는 컨테이너 init system 관련 경고에 가깝다. 이 케이스에서 실제 차단 원인은 `access denied by server`다.

### 원인

S3 Files는 두 종류의 IAM 권한을 사용한다.

- S3 Files service가 S3 bucket을 읽고 쓰는 권한
- S3 Files client가 compute resource에서 file system을 mount하는 권한

이 실습에서 `aws_iam_role.s3files_bucket_access`는 첫 번째 권한이다. 하지만 pod mount는 EFS CSI node pod가 수행하므로, EFS CSI node Pod Identity role에도 S3 Files client 권한이 필요하다.

### 확인

EFS CSI node pod가 어떤 service account를 쓰는지 확인한다.

```bash
export AWS_PROFILE=eks
kubectl get pod -n kube-system -l app=efs-csi-node \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.serviceAccountName}{"\t"}{.spec.nodeName}{"\n"}{end}'
```

이 실습에서는 `efs-csi-node-sa`가 `app-genai-ch5-eks-efs-csi-node` Pod Identity role을 사용한다.

해당 role에 S3 Files client policy가 붙었는지 확인한다.

```bash
aws iam list-attached-role-policies \
  --role-name app-genai-ch5-eks-efs-csi-node
```

`AmazonS3FilesClientFullAccess`가 없으면 mount가 `access denied`로 실패할 수 있다.

### 조치

Terraform에서 EFS CSI node role에 AWS managed policy를 붙인다.

```hcl
resource "aws_iam_role_policy_attachment" "efs_csi_node_s3files_client" {
  role       = aws_iam_role.efs_csi_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FilesClientFullAccess"
}
```

적용한다.

```bash
cd eks/terraform
terraform plan
terraform apply
```

IAM 전파를 잠시 기다린 뒤 JupyterHub user server를 다시 시작한다.

```bash
kubectl delete pod -n jupyterhub jupyter-k8s-user1 --ignore-not-found
kubectl get pods -n jupyterhub -w
```

JupyterHub UI를 사용 중이면 user server를 Stop 후 Start한다.

### 참고자료

- S3 Files prerequisites: https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files-prereq-policies.html
- S3 Files troubleshooting: https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files-troubleshooting.html

## GPU Jupyter pod evicted by ephemeral storage

### 증상

JupyterHub singleuser pod가 GPU node에 스케줄된 뒤 이미지 pull은 성공하지만 바로 종료된다.

```text
Successfully pulled image "cschranz/gpu-jupyter:v1.10_cuda-12.9_ubuntu-24.04"
Image size: 13562993620 bytes
The node was low on resource: ephemeral-storage.
Reason: Evicted
```

노드를 보면 GPU node에 `DiskPressure=True`가 잡힌다.

```bash
kubectl get nodes \
  -o custom-columns='NAME:.metadata.name,NODE_TYPE:.metadata.labels.node-type,DISK_PRESSURE:.status.conditions[?(@.type=="DiskPressure")].status,EPHEMERAL:.status.allocatable.ephemeral-storage,TAINTS:.spec.taints[*].key'
```

### 원인

`cschranz/gpu-jupyter:v1.10_cuda-12.9_ubuntu-24.04` 이미지는 약 13.5GB다. 컨테이너 런타임은 압축 이미지뿐 아니라 unpack된 layer와 kubelet 여유 공간도 필요하다.

GPU node root volume이 50Gi이면 이미지 pull 후 `node.kubernetes.io/disk-pressure` taint가 생기고 singleuser pod가 evict될 수 있다.

### 조치

GPU managed node group root volume을 키운다. 이 실습에서는 `gpu_node_disk_size` 기본값을 200Gi로 둔다.

```hcl
gpu_node_disk_size = 200
```

적용 전 plan을 확인한다.

```bash
cd eks/terraform
terraform plan
```

확인 필요: EKS managed node group의 launch template disk size 변경은 새 노드 교체가 필요할 수 있다. 실습 중이면 Terraform apply 후 새 GPU node가 Ready가 됐는지 확인하고, 기존 DiskPressure node가 남아 있으면 node group update 또는 drain/replace 상태를 확인한다.

```bash
kubectl get nodes -L node-type,nvidia.com/gpu,node.kubernetes.io/instance-type
kubectl get nodes \
  -o custom-columns='NAME:.metadata.name,NODE_TYPE:.metadata.labels.node-type,DISK_PRESSURE:.status.conditions[?(@.type=="DiskPressure")].status,EPHEMERAL:.status.allocatable.ephemeral-storage,TAINTS:.spec.taints[*].key'
```

## JupyterHub user PVC zone conflict

### 증상

JupyterHub singleuser pod가 Pending 상태로 남고 scheduler event에 다음 메시지가 나온다.

```text
0/4 nodes are available: 1 node(s) had volume node affinity conflict,
3 Insufficient cpu, 3 Insufficient memory, 3 Insufficient nvidia.com/gpu.
```

### 원인

JupyterHub singleuser home PVC인 `claim-k8s-user1`은 `gp3` StorageClass를 사용한다. `gp3`는 EBS volume이고 EBS volume은 하나의 AZ에 묶인다.

GPU node가 Spot 교체나 node group update 이후 다른 AZ에 뜨면, 기존 user home EBS volume을 새 GPU node에 attach할 수 없다.

예를 들어 다음 조합이면 scheduling이 실패한다.

```text
claim-k8s-user1 PV zone: ap-northeast-2a
GPU node zone:           ap-northeast-2c
```

### 확인

GPU node가 뜬 AZ를 확인한다.

```bash
kubectl get nodes \
  -L node-type,nvidia.com/gpu,node.kubernetes.io/instance-type,topology.kubernetes.io/zone
```

JupyterHub user PVC가 바인딩된 PV를 확인한다.

```bash
kubectl get pvc -n jupyterhub claim-k8s-user1
```

PV의 node affinity와 EBS volume ID를 확인한다.

```bash
kubectl get pv <claim-k8s-user1-volume-name> \
  -o jsonpath='{.spec.nodeAffinity}{"\n"}{.spec.csi.volumeHandle}{"\n"}'
```

### 조치

실습 중이고 user home PVC 안의 데이터가 중요하지 않으면 PVC를 삭제하고 다시 만든다. 새 singleuser pod가 스케줄될 때 `WaitForFirstConsumer` 정책에 따라 현재 GPU node AZ에 새 EBS volume이 만들어진다.

```bash
kubectl delete pod -n jupyterhub jupyter-k8s-user1 --ignore-not-found
kubectl delete pvc -n jupyterhub claim-k8s-user1
```

그 다음 JupyterHub UI에서 user server를 다시 Start한다.

중요한 파일은 `claim-k8s-user1` home PVC에 두지 말고 S3 Files mount 경로에 둔다.

- `/data/chapter5`
- `/opt/notebooks`
- `/model-assets`

장기적으로 GPU Spot node가 여러 AZ 중 어디에 뜰지 바뀔 수 있다. user home을 유지해야 한다면 gp3/EBS 대신 S3 Files 또는 EFS 같은 RWX 스토리지 사용을 검토한다.

## S3 Files PV 변경이 pod 재시작 후 반영되지 않음

### 증상

S3 bucket에는 파일이 있지만 JupyterHub singleuser pod에서 S3 Files mount 경로가 비어 있다.

```bash
kubectl exec -n jupyterhub -it jupyter-k8s-user1 -- ls -la /data/chapter5
kubectl exec -n jupyterhub -it jupyter-k8s-user1 -- ls -la /opt/notebooks
```

예를 들어 `/data/chapter5/loyalty_qa_train.jsonl`을 읽어야 하는데 다음 에러가 난다.

```text
FileNotFoundError: Unable to find '/data/chapter5/loyalty_qa_train.jsonl'
```

### 원인

이 경우는 JupyterHub 설정 문제보다 기존 PV가 예전 S3 Files mount 형식으로 남아 있는 문제가 더 유력하다.

현재 EFS CSI driver의 S3 Files access point는 PV의 `volumeHandle`에 넣는다.

```yaml
csi:
  driver: efs.csi.aws.com
  volumeHandle: "s3files:${S3FILES_FILE_SYSTEM_ID}::${S3FILES_ACCESS_POINT_ID}"
```

예전처럼 `mountOptions`에 `accesspoint=...`를 넣은 PV가 이미 만들어져 있으면 pod를 삭제해도 새 access point 형식으로 바뀌지 않는다.

```yaml
csi:
  driver: efs.csi.aws.com
  volumeHandle: s3files:fs-xxxxxxxx
mountOptions:
  - iam
  - accesspoint=fsap-xxxxxxxx
```

`spec.csi.volumeHandle`은 PV의 CSI volume identity다. 기존 PV/PVC가 남아 있으면 JupyterHub user server를 재시작해도 Kubernetes는 같은 PV를 다시 mount한다.

### 확인

PV가 어떤 형식으로 만들어졌는지 확인한다.

```bash
kubectl get pv chapter5-s3files-pv chapter5-model-assets-pv -o yaml
```

정상 예시는 access point ID가 `volumeHandle` 안에 들어간다.

```text
s3files:fs-xxxxxxxx::fsap-xxxxxxxx
```

비정상 예시는 `volumeHandle`에 file system ID만 있고, access point가 `mountOptions`에 있다.

```text
volumeHandle: s3files:fs-xxxxxxxx
mountOptions:
- iam
- accesspoint=fsap-xxxxxxxx
```

### 조치

PV/PVC를 삭제하고 최신 manifest로 다시 만든다. `persistentVolumeReclaimPolicy: Retain`이므로 PV/PVC를 삭제해도 S3 bucket object는 삭제되지 않는다.

```bash
export AWS_PROFILE=eks
cd eks/terraform
export S3FILES_FILE_SYSTEM_ID=$(terraform output -raw s3files_file_system_id)
export S3FILES_ACCESS_POINT_ID=$(terraform output -raw s3files_access_point_id)
export S3FILES_MODEL_ASSETS_ACCESS_POINT_ID=$(terraform output -raw s3files_model_assets_access_point_id)
cd ../..

kubectl delete pod -n jupyterhub jupyter-k8s-user1 --ignore-not-found
kubectl delete pvc -n jupyterhub chapter5-s3files-pvc chapter5-model-assets-pvc --ignore-not-found
kubectl delete pv chapter5-s3files-pv chapter5-model-assets-pv --ignore-not-found

kubectl apply -f eks/manifests/storage/nfs-storageclass.yaml
envsubst < eks/manifests/s3files/persistent-volume.yaml | kubectl apply -f -
kubectl apply -f eks/manifests/s3files/persistent-volume-claim.yaml
envsubst < eks/manifests/s3files/model-assets-persistent-volume.yaml | kubectl apply -f -
kubectl apply -f eks/manifests/s3files/model-assets-persistent-volume-claim.yaml
```

다시 만들어진 PV의 `volumeHandle`을 확인한다.

```bash
kubectl get pv chapter5-s3files-pv chapter5-model-assets-pv \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.csi.volumeHandle}{"\n"}{end}'
```

JupyterHub UI에서 user server를 다시 Start한 뒤 mount 경로를 확인한다.

```bash
kubectl exec -n jupyterhub -it jupyter-k8s-user1 -- ls -la /data/chapter5
kubectl exec -n jupyterhub -it jupyter-k8s-user1 -- ls -la /opt/notebooks
kubectl exec -n jupyterhub -it jupyter-k8s-user1 -- stat -c '%u:%g %a %n' /model-assets
```

## Model save permission denied on S3 Files

### 증상

Qwen fine-tuning은 끝났지만 모델 저장 단계에서 다음 에러가 난다.

```text
PermissionError: [Errno 13] Permission denied: '/model-assets/README.md'
```

### 원인

`trainer.save_model()`은 adapter weight만 저장하지 않고 모델 카드 `README.md`도 쓴다. `/model-assets`가 S3 Files PVC mount이면 S3 Files의 POSIX 권한과 access point POSIX user가 쓰기 가능해야 한다.

### 확인

Jupyter singleuser pod의 UID/GID와 mount 권한을 확인한다.

```bash
kubectl exec -n jupyterhub -it jupyter-k8s-user1 -- id
kubectl exec -n jupyterhub -it jupyter-k8s-user1 -- ls -ld /model-assets
```

이 실습의 Terraform 기본값은 노트북 이미지의 일반적인 `jovyan` 사용자에 맞춰 S3 Files access point POSIX user를 `1000:1000`으로 둔다. 실제 singleuser UID/GID가 다르면 `s3files_access_point_uid`, `s3files_access_point_gid`를 실제 UID/GID로 맞춘다.

### 조치

모델 저장 경로는 공유 S3 Files PVC에서 분리한다. `data/chapter5`, `notebooks`는 `chapter5-s3files-pvc`를 사용하고, `/model-assets`는 `chapter5-model-assets-pvc`를 `subPath` 없이 직접 mount한다.

Terraform output에서 모델 저장 access point ID를 받아 PV manifest의 `volumeHandle`에 주입한다.

```bash
cd eks/terraform
export S3FILES_FILE_SYSTEM_ID=$(terraform output -raw s3files_file_system_id)
export S3FILES_MODEL_ASSETS_ACCESS_POINT_ID=$(terraform output -raw s3files_model_assets_access_point_id)
cd ../..
```

이미 떠 있는 singleuser pod에는 새 PV mount가 반영되지 않는다. JupyterHub UI에서 user server를 Stop 후 Start하거나 pod를 삭제해서 다시 만든다.

기존 `chapter5-s3files-pv`는 읽기용 공유 PV로 남겨 둔다. 모델 저장용 PV/PVC만 새로 만든다.

```bash
kubectl delete pod -n jupyterhub jupyter-k8s-user1 --ignore-not-found
kubectl delete pvc -n jupyterhub chapter5-model-assets-pvc --ignore-not-found
kubectl delete pv chapter5-model-assets-pv --ignore-not-found

envsubst < eks/manifests/s3files/model-assets-persistent-volume.yaml | kubectl apply -f -
kubectl apply -f eks/manifests/s3files/model-assets-persistent-volume-claim.yaml
```

`chapter5-model-assets-pvc`가 이미 잘못된 access point로 만들어졌다면 해당 PVC/PV만 삭제하고 다시 만든다. S3 bucket 데이터는 삭제되지 않는다.

```bash
kubectl get pv chapter5-model-assets-pv \
  -o jsonpath='{.spec.csi.volumeHandle}{"\n"}'
```
