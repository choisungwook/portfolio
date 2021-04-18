# 개요
* nfs서버 설치
* os: centos7

# 디폴트 설정
## virtualbox
* disk: 200GB
* IP: 192.168.25.132

## nfs 설정
* /etc/exports: 192.168.25.0/24 대역 모든활동 허용
```sh
/nfs 192.168.25.* (rw,no_root_squash,rync)
```
* 공유볼륨 경로: /mnt/kubernetes

# 실행
```
vagrant up
```

# 종료
```
vagrant destroy -f
```