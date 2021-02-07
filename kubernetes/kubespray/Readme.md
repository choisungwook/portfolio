# 개요
* kubesrpay 설치를 위한 인프라
* 이미지: centos 7

# 주의사항
* vagrant 설치 후 NAT 네트워크 인터페이스 제거
 
# 설치준비
## ip 포워딩
```sh
modprobe br_netfilter
sudo sh -c "echo '1' > /proc/sys/net/bridge/bridge-nf-call-iptables"
sudo sh -c "echo '1' > /proc/sys/net/ipv4/ip_forward"
```

## 방화벽 비활성화
```sh
 systemctl disable firewalld
```

# 설치 방법
## bootstrap 접속
```
vagrant ssh kube-bootstrap
cd kubespray
```

## 키 생성
```sh
ssh-keygen
```

## 키 복사
```sh
ssh-copy-id root@192.168.219.211
```

## ansible 인벤토리 설정
```sh
cp -rfp inventory/sample inventory/mycluster
vi inventory/mycluster/inventory.ini

[all]
master ansible_host=192.168.219.211
node1 ansible_host=192.168.219.212
node2 ansible_host=192.168.219.213

[kube-master]
master

[etcd]
master

[kube-node]
node1
node2

[calico-rr]

[k8s-cluster:children]
kube-master
kube-node
calico-rr
```

## 인벤토리 설정 확인
```
/usr/local/bin/ansible all -i inventory/mycluster/inventory.ini -m ping
```

## 설치
```sh
/usr/local/bin/ansible-playbook -i inventory/mycluster/inventory.ini -become --become-user=root cluster.yml
```

# 참고자료
* [1] https://memory-hub.tistory.com/8