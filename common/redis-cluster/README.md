# redis cluster 생성

```sh
helm upgrade --install redis oci://registry-1.docker.io/bitnamicharts/redis-cluster \
  -n redis --create-namespace \
  --set usePassword=false
  # --set service.type=NodePort \
  # --set service.nodePorts.redis=32100
```
