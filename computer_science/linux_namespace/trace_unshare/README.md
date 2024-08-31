# 개요
* strace를 사용하여 docker 컨테이너가 unshare syscall을 사용한다는 것을 확인
* 더 정확히 설명하면 containerd가 unshare syscall을 호출

# 실습환경
* (옵션1) docker가 실행된 linux 가상머신을 생성
* (옵션2) linux운영체제를 사용하는 AWS EC2인스턴스

# 실습

* 2개 쉘이 필요합니다.
* 첫번째 쉘에서 containerd를 strace합니다. 아래 명령어는 strace결과를 strace_log.txt파일에 저장합니다.

```sh
sudo strace -f -p `pidof containerd` -o strace_log.txt
```

* 두번째 쉘에서 docker 컨테이너를 실행합니다.

```sh
sudo docker run --rm -it ubuntu /bin/bash
```

* strace_log.txt파일을 분석합니다.

```sh
grep "unshare" ./strace_log.txt
```

# 참고자료
* strace docker: https://blog.devops.dev/deconstructing-docker-part-iii-creating-our-own-container-6128b8fc7ba6
