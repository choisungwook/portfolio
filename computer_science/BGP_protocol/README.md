## 개요

* docker를 사용하여 BGP 프로토콜 간단히 실습

## 실습환경 구축

* docker compose로 FRR컨테이너와 nginx 컨테이너 구축
* FRR 설정파일 목록
  * frr.conf
  * daemons: FRR컴퍼넌트 활성화 여부 설정
  * vtysh.conf: FRR컴퍼넌트들의 설정파일들을 frr.conf 한개로 사용

## 기타 실습파일

* [Makefile - 로컬 자동화 스크립트 실행](./Makefile)
* [(deprecated)terraform - aws환경에서 containerlab 설정](./terraform/)
* [deprecated - containerlab](./depreacted/)

## 첫번째 시나리오: 라우터가 필요한 이유

### 개요

* 다른 대역과 통신할 때 라우터가 필요하다.
* 첫번째 시나리오는 라우터가 없으면 다른 대역과 통신이 안되는 것을 실습한다.

![](./imgs/bridge.png)

### 실습

1. docker compose up

```sh
docker compose -f docker-compose-only-nginx.yml up -d
```

2. 실행 확인

```sh
docker compose -f docker-compose-only-nginx.yml ps
```

![](./imgs/only-bridge-docker-ps.png)

3. nginx1 컨테이너 -> nginx2 컨테이너 통신 확인

* 대역이 다르기 때문에 당연히 통신 불가

```sh
docker exec -it nginx1 curl --max-time 1 192.168.200.1
```

![](./imgs/only-bridge-curl.png)

## 각 FRR 라우터의 라우팅 테이블 확인

```sh
docker exec -it frr1 vtysh -c "show ip route"
docker exec -it frr2 vtysh -c "show ip route"
docker exec -it frr3 vtysh -c "show ip route"
```




ip route add 192.168.200.0/24 via 172.28.3.3 dev eth0
curl 192.168.200.12
show ip bgp


docker exec -it frr1 vtysh -c "show running-config"
docker exec -it frr1 ip route


## 설정 설명

## vtysh.conf

* service integrated-vtysh-config: FRR컴퍼넌트를 frr.conf한개로 사용


$ docker exec -it frr1 vtysh -c "show ip bgp neighbors 172.28.3.3 received-routes"

% Inbound soft reconfiguration not enabled

docker exec -it frr1 vtysh -c "show ip bgp"
