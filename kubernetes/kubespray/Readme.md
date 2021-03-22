# 개요
* kubesrpay 설치를 위한 인프라
* 이미지: centos 7

# 설치 순서
## 설정
* bootstrap, 마스터, 워커노드 IP설정
* inventory.ini 설정

## vagrant 실행
```
vagrant up
```

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

## ansible 인벤토리 확인
```sh
cp -rfp inventory/sample inventory/mycluster
cat inventory/mycluster/inventory.ini
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
* [2] [computingforgeeks 설치 메뉴얼](https://computingforgeeks.com/deploy-kubernetes-cluster-centos-kubespray/)
* [3] [TroubleShooting-coredns 갯수](https://github.com/kubernetes-sigs/kubespray/issues/3880)