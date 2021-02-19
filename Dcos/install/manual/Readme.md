# 개요
* dcos 설치 
* 이미지: centos7

<br>

# 인프라
* vagrantfile로 vm 구성
  * bootstrap, master, agent

<br>

## ip 설정
* master node ip
```yaml
; files/genconf/config.yaml 8번째줄 IP 수정
master_list:
- <your_master_ip>
```

```sh
; Vagrantfile 5번째줄 IP 수정
MASTER_IP = <your_master_ip>
```

* bootstrap node ip
```yaml
; files/genconf/config.yaml 1번째줄 IP와 포트 수정
bootstrap_url: http://<your_ip>:<your_port>
```

```
; Vagrantfile 수정 6번째줄 IP 수정
BOOTSTRAP_IP = <your_bootstrap_ip>

; Vagrantfile 79번째줄 IP수정
curl -O http://<your_bootstrap_ip>:<your_bootstrap_port>/dcos...

; Vagrantfile 109번째줄 IP수정
curl -O http://<your_bootstrap_ip>:<your_bootstrap_port>/dcos...
```

<br>

# 설치
## bootstrap
* dcos_generate_config.sh 실행
```sh
cd /home/vagrant
sudo su ; 루트계정 로그인
bash dcos_generate_config.sh
```

* your-port를 getconf/config.yaml에 설정한 bootstrap_url포트로 변경
  * 편의상 http default port인 80번으로 설정
```sh
sudo docker run -d -p <your-port>:8888 -v $PWD/genconf/serve:/usr/share/nginx/html:ro nginx
```

## master
```sh
mkdir /tmp/dcos && cd /tmp/dcos
curl -O http://<bootstrap-ip>:<bootstrap-port>>/dcos_install.sh
sudo bash dcos_install.sh master
sudo bash dcos_install.sh master
```

## agent
```sh
mkdir /tmp/dcos && cd /tmp/dcos
curl -O http://<bootstrap-ip>:<bootstrap-port>/dcos_install.sh
sudo bash dcos_install.sh slave
sudo bash dcos_install.sh slave
```

# 접속
* http://master_ip

![](imgs/access_homepage.png)

<br>

# TroubleShooting
## chronyd 충돌
* chronyd는 ntpd랑 충돌이 나므로 비활성화
```sh
systemctl disable chronyd
```

<br>

## 버전 다운
* 최신 버전은 설치 하지 말 것: 최신 버전은 설치 불가
* 현재 2.2버전이 최신버전이고 두 단계 아래 버전인 2.0을 설치 

<br>

# 참고자료
* [1] [블로그-DCOS 설치](https://github.com/5wjdgns2/DC-OS)