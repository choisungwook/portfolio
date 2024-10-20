# 개요
* vault HA mode 테스트

# 사전지식
* vault는 raft알고리즘으로 HA mode를 구성

# 설치

## vault HA mode 설치
* docker compose 실행

```sh
docker compose up -d
```

* vault1번 노드에서 vault cluster 초기화(unseal, root를 꼭 보관)

```sh
docker exec vault1 vault operator init -key-shares=1 -key-threshold=1
docker exec vault1 vault status
```

* vault1번 노드에서 unseal상태로 변경

```sh
docker exec -it vault1 /bin/sh

# unseal을 총 1번 실행
container# vault operator unseal

# vault status로 unseal되었는지 확인
container# vault status
```

![](./imgs/unseal.png)


* 나머지 노드에서 vault cluster 조인

```sh
# vault1노드에서 unseal상태로 설정
docker exec vault2 vault operator raft join http://vault1:8200
docker exec vault3 vault operator raft join http://vault1:8200
```

![](./imgs/join_vault.png)

* 나머지노드에서 vault unseal상태로 변경

```sh
# 2번노드에서 unseal상태로 변경
docker exec -it vault2 /bin/sh

# unseal을 총 1번 실행
container# vault operator unseal

# vault status로 unseal되었는지 확인
container# vault status

# 3번 노드에서 unseal상태로 변경
docker exec -it vault3 /bin/sh

# unseal을 총 1번 실행
container# vault operator unseal

# vault status로 unseal되었는지 확인
container# vault status
```

* vault1번노드에서 raft 상태 확인

```sh
docker exec vault1 vault operator raft list-peers
```

![](./imgs/list-peers.png)

## (옵션) prometheus 설치
* prometheus 설치


# HA mode 테스트

## vault login

```sh
export VAULT_ADDR='http://127.0.0.1:8200';
vault login
```

## vault secret 엔진을 v2로 변경

```sh
vault secrets disable secret
vault secrets enable -path=secret -version=2 kv
```

## vault secret 생성

```sh
for i in {1..10000}; do sleep 1; vault kv put -mount=secret kv/$i-secret id=$i; vault kv get -mount=secret kv/$i-secret; done
```

## 모니터링

* vault peer list

```sh
watch vault operator raft list-peers
watch vault operator members
```

# 참고자료
* youtube: https://youtu.be/gC7LMjR0978?si=e2i9XWjrAtGqz8GX
* https://github.com/hashicorp/katakoda/blob/master/vault-raft/step1.md
