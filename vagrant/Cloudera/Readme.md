# 준비
> 참고자료: https://docs.cloudera.com/documentation/enterprise/latest/topics/installation_reqts.html#pre-install

* jdk8 설치 <-- 안해도 되는듯.. 설치중에 자동 설치
* 방화벽 비활성화
* chrony 또는 ntp 설치
* python 2.7 설치
* selinux 비활성화

<br>

# tiral버전 다운로드
* 평가판 다운로드 링크 제공
![](imgs/trial.png)

```sh
$ wget https://archive.cloudera.com/cm7/7.1.4/cloudera-manager-installer.bin
$ chmod u+x cloudera-manager-installer.bin
$ sudo ./cloudera-manager-installer.bin
```

* 설치는 CUI로 진행
![](imgs/installing.png)

* 설치가 끝나면 접속페이지 제공
![](imgs/install_done.png)
