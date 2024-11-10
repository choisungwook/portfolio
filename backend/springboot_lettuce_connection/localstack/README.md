# 개요
* 로컬환경에서 ElasticCache 구축

# 준비
* localstack
* Localstack pro 라이센스

# 생성방법

* ElasticCache 클러스터 생성

```sh
awslocal elasticache create-replication-group \
  --engine redis \
  --replication-group-id my-clustered-redis-replication-group \
  --replication-group-description 'my clustered replication group' \
  --cache-node-type cache.t2.micro \
  --num-node-groups 2 \
  --replicas-per-node-group 2
```

* 클러스터 엔드포인트 조회

```sh
awslocal elasticache describe-replication-groups --replication-group-id my-clustered-redis-replication-group \
    --query "ReplicationGroups[0].ConfigurationEndpoint"
{
  "Address": "localhost.localstack.cloud",
  "Port": 4510
}
```

# 삭제 방법

```sh
awslocal elasticache delete-replication-group \
  --replication-group-id my-clustered-redis-replication-group
```
