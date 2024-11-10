# 개요
* redis-cluster 생성

# 생성 방법

```sh
helm upgrade --install redis oci://registry-1.docker.io/bitnamicharts/redis-cluster \
  -n default \
  --set cluster.nodes=3 \
  --set cluster.replicas=0 \
  --set usePassword=false
```
