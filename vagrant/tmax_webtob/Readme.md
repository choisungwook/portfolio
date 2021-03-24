# 개요
* Tmax기업의 webtob, jeus설치

<br>

# 준비
* TMAX홈페이지에서 webtob.bin, jeus.bin 설치파일 다운로드

<br>

# webtob
## 설치
```sh
sudo su
chmod 755 ./webtob.bin
./webtob.bin
```

## 라이센스 복사
```sh
cp license.dat /root/webtob/license/license.dat
```

## 실행
```sh
cd /etc/webtob/config
wscfl -i /http.m
```

```sh
wsboot
```

<br>

# jeus
## 설치
```sh
sudo su
chmod 755 ./jeus.bin
./jeus
```

# 라이센스 설정
```sh
cp -r license /root/jeus5/license/license
```

## 실행
* WAS실행
```sh
jeus
```

* admin 로그인
```sh
jeusadmin webtob
```

* webadmin페이지 접속
* http://ip:9744/webadmin

<br>

# 참고자료
* [1] [webtob 다운로드](https://technet.tmaxsoft.com/ko/front/download/findDownloadList.do?cmProductCode=0102)
* [2] [jeus 다운로드](https://technet.tmaxsoft.com/ko/front/download/findDownloadList.do?cmProductCode=0101)
* [3] [centos7 openjdk8 설치](https://lee-jisoo.github.io/devlog/2018/09/18/linux-java-install)