# 개요
* 리눅스에서 unshare을 사용하여 mount namespace를 생성
* 유투브 링크: https://youtu.be/CIvwIplZS1U?si=zbCMoybcKkJywhzZ

# 실습

1. unshare로 /bin/sh 쉘 실행

```sh
unshare -m /bin/sh
```

2. host와 /bin/sh쉘에서 mount namespace확인

```sh
# host
$ readlink /proc/$$/ns/mnt
mnt:[4026531841]

# unshare /bin/sh
$ readlink /proc/$$/ns/mnt
mnt:[4026532587]
```

3. /bin/sh쉘에서 mount작업을 하고 host에서 마운트 디렉터리가 있는지 확인. 없어야 정상

```sh
# unshare /bin/sh
$ mkdir /tmp/mount_test
$ mount -t tmpfs tmpfs /tmp/mount_test
mnt:[4026532587]
$ df -h | grep mount_test
tmpfs                              482M     0  482M   0% /tmp/mount_test

# host
$ df -h | grep mount_test
결과 없음
```
