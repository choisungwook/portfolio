# 개요
* Lettuce 라이브러리에서 Redis Failover connection 테스트

# 목차
* [springboot 소스코드](./connection-test/)
* 실습환경 구축
  * [kind cluster](./kind-cluster/)
  * [Redis cluster](./manifests/redis-cluster/)
  * [kubernetes manifest](./manifests/)
  * [옵션 ArgoCD](../../common_k8s_manifests/argocd/use_helm/)
  * [옵션localstack](./localstack/)
  * [옵션 EKS](./terraform/)

# 참고자료
* https://docs.google.com/presentation/d/1FtEFBCubpcqMJ6C7YV55KAxjhZ5znYn6A3f1c341Lcg/edit#slide=id.g25a881cd3a5_0_166
* https://jojoldu.tistory.com/418
* https://github.com/redis/lettuce/wiki/Connection-Pooling
* https://learn.microsoft.com/ko-kr/azure/azure-cache-for-redis/cache-best-practices-connection
* https://velog.io/@komment/Spring-Boot-Redis-Cluster-with-lettuce-redisson
* https://iizz.tistory.com/200
* https://blog.leocat.kr/notes/2022/04/15/lettuce-config-for-redis-cluster-topology-refresh
