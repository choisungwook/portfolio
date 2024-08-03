# 1. 개요
* SSH 프로토콜이 왜 안전한지 telnet과 비교

# 2. pcap파일
* [폴더 이동](./pcap_files/)

# 3. 실습환경 구축
* docker-compose로 실습환경 구축
* client(netshoot), ssh-server, telnet-server container로 구성됨

```sh
$ docker-compose up -d
$ docker-compose ps
NAME            IMAGE                  COMMAND                  SERVICE         CREATED      STATUS      PORTS
client          nicolaka/netshoot      "/bin/sh -c 'while s…"   client          2 days ago   Up 2 days
ssh_server      docker-ssh_server      "/usr/sbin/sshd -D"      ssh_server      2 days ago   Up 2 days   22/tcp
telnet_server   docker-telnet_server   "/usr/sbin/xinetd -s…"   telnet_server   2 days ago   Up 2 days   23/tcp
```

# 4. telnet server로 안전하지 않는 통신 확인

```sh
$ docker-compose exec -it client /bin/zsh
$ (client)# tcpdump -i eth0 tcp port 23 -w telnet.pcap
```

```sh
# 쉘을 한개 더 열어서
$ docker-compose exec -it client /bin/zsh
$ (client)# telnet telnet_server 23
onnected to telnet_server

Entering character mode
Escape character is '^]'.

Ubuntu 22.04.4 LTS
telnet_server login: root #입력
Password: password #입력
```

```sh
# 덤프한 패킷 파일 복사
docker cp client:/root/telnet.pcap ./telnet.pcap
```

# 5. SSH 예제
## 5.1 client 컨테이너에서 키 쌍 생성

```sh
$ docker exec -it client -- /bin/bash
(clinet)# ssh-keygen -t rsa -b 4096 -C "your.email@example.com"
(clinet)# ls ~/.ssh
id_rsa  id_rsa.pub
```

## 5.2 ssh-server 컨테이너에서 client 공개키 등록

```sh
$ docker exec -it ssh_server -- /bin/bash
(clinet)# cat ~/.ssh/id_rsa.pub

$ docker exec -it ssh_server -- /bin/bash
(ssh_server)# mkdir -p ~/.ssh
(ssh_server)# vi ~/.ssh/authorized_keys
client container 공개키를 붙여넣기
```
'
## 5.3 client 컨테이너에서 ssh를 사용하여 ssh_server 컨테이너 접속

```sh
$ docker exec -it ssh_server -- /bin/bash
(clinet)# ssh root@ssh_server
Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 6.6.26-linuxkit aarch64)
root@ssh_server:~#
```

# 참고자료
* https://asecuritysite.com/encryption/ssh
* https://goteleport.com/blog/ssh-handshake-explained/
