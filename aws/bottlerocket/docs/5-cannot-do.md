# Bottlerocket host에서 못 하는 것과 대신 하는 것

AL2023 노드에서 습관처럼 하던 작업이 Bottlerocket host에서 어떻게 거부되는지 하나씩 시도한다. 거부 메시지가 어느 구조에서 나왔는지 읽는 연습이다. 모두 host root 셸(`sudo sheltie`)에서 시도한다. 환경은 [3-setup-ec2.md](3-setup-ec2.md)이고, 들어가는 절차는 [4-first-access.md](4-first-access.md)다.

> 결과 열은 Bottlerocket 공식 문서 기준 예상이다. 실측으로 확인하지 않았다(확인 필요). 실행 결과가 다르면 이 문서를 고친다.

## 원리

거부는 3가지 구조 중 하나에서 나온다. 메시지를 보면 어느 구조인지 구분된다.

| 구조 | 거부 메시지 | 대상 |
|---|---|---|
| host에 바이너리가 없다 | `command not found`, `No such file or directory` | 셸, 패키지 관리자, cron, 인터프리터 |
| 루트 파일시스템이 읽기 전용이다 | `Read-only file system` | `/usr`, `/bin` 아래 쓰기 |
| SELinux enforcing과 kernel lockdown | `Permission denied`, `Operation not permitted` | 설정 저장소, 컨테이너 layer, 커널 모듈 |

세부는 [2-concepts.md](2-concepts.md)의 읽기 전용 루트 파일시스템 절에 있다.

## 실습. 하나씩 시도한다

host 셸에서 순서대로 실행한다.

```bash
ls /bin/sh /bin/bash /usr/bin/python3
dnf install -y htop
crontab -l
touch /usr/bin/hello
echo x > /usr/sbin/myagent
setenforce 0
```

| 하려는 일 | 명령 | 예상 결과 | 막는 구조 |
|---|---|---|---|
| 셸 찾기 | `ls /bin/sh /bin/bash /usr/bin/python3` | 셋 다 `No such file or directory` | host에 셸, 인터프리터 없음 |
| 패키지 설치 | `dnf install -y htop` | `command not found` | host에 패키지 관리자 없음 |
| cron 등록 | `crontab -l` | `command not found` | host에 cron 없음 |
| 루트 파일시스템 쓰기 | `touch /usr/bin/hello` | `Read-only file system` | 읽기 전용 마운트, dm-verity |
| host 바이너리 추가 | `echo x > /usr/sbin/myagent` | `Read-only file system` | 실행 경로 전체가 루트 파일시스템 |
| SELinux 끄기 | `setenforce 0` | 명령이 없거나 거부 | enforcing 고정 |
| 서명 없는 커널 모듈 적재 | `insmod ./my.ko` | 거부 | kernel lockdown integrity |
| host에 SSH | `ssh -p 2222 ec2-user@localhost`(SSM port forwarding) | admin container가 꺼져 있으면 연결 거부 | host에 sshd 없음 |

## 쓰기가 되는 곳은 2군데이고 남는 곳은 1군데다

host 셸에서 `/etc`와 `/local`에 파일을 만든다. 둘 다 성공한다.

```bash
echo test > /etc/hello
echo test > /local/hello
ls -l /etc/hello /local/hello
```

차이는 재부팅 후에 드러난다. 재부팅과 확인은 [6-settings-and-update.md](6-settings-and-update.md)에서 한다.

| 경로 | 지금 | 재부팅 후 | 이유 |
|---|---|---|---|
| `/etc/hello` | 있음 | 없음 | `/etc`는 tmpfs. 부팅마다 API 설정에서 다시 만든다 |
| `/local/hello` | 있음 | 있음 | 데이터 볼륨 |

- `/etc/systemd/system`에 unit을 써서 systemd timer를 만들어도 같은 이유로 재부팅 후 사라진다
- `/etc/containerd/config.toml`을 고쳐도 재부팅 후 원래대로 돌아온다. 원본은 API 설정이다
- `/local`에 바이너리를 두고 실행할 수 있는지는 SELinux 라벨에 달렸다(확인 필요). 되더라도 OS가 관리하지 않는 상태라 노드 교체 때 사라진다

## 패키지는 admin container 안에만 설치된다

admin container는 Amazon Linux 2023 이미지라 `dnf`가 있다. host 셸에서 `exit`로 admin container에 나와 설치한다.

```bash
exit
sudo dnf install -y tcpdump
which tcpdump
sudo sheltie
which tcpdump
```

| 위치 | `which tcpdump` | 이유 |
|---|---|---|
| admin | 있음. host 네트워크를 쓰므로 노드의 인터페이스를 볼 수 있다 | admin container 파일시스템에 설치됐다 |
| host | 없음 | host 파일시스템은 그대로다 |

- 장애 때 `tcpdump`, `strace` 같은 도구가 필요하면 admin container에 설치해 host 네트워크와 PID 네임스페이스를 통해 쓴다
- admin container를 끄고 켜도 설치한 패키지가 남는지는 확인 필요

## 그래서 대신 하는 것

| AL2023에서 하던 일 | Bottlerocket에서 하는 일 | 세부 |
|---|---|---|
| host에 로그, 보안, 모니터링 에이전트 설치 | DaemonSet으로 배포 | [9-operations.md](9-operations.md) |
| user data 셸 스크립트로 부팅 시 작업 | bootstrap container | [9-operations.md](9-operations.md) |
| `/etc/sysctl.d`에 sysctl 추가 | `settings.kernel.sysctl` TOML | [9-operations.md](9-operations.md) |
| kubelet 플래그 편집 | `settings.kubernetes` 아래 노출된 키만 | [9-operations.md](9-operations.md) |
| SSH로 들어가 진단 | SSM → admin container → `sheltie` | [4-first-access.md](4-first-access.md) |
| `dnf update`로 패치 | A/B 업데이트 또는 노드그룹 AMI 교체 | [6-settings-and-update.md](6-settings-and-update.md) |

## 트러블슈팅

| 증상 | 원인 | 확인과 조치 |
|---|---|---|
| `touch /usr/bin/hello`가 성공했다 | host가 아니라 admin container에 있다 | `cat /etc/os-release`. Amazon Linux면 `sudo sheltie`로 들어간다 |
| `dnf`가 host에서 된다 | 위와 같음 | 위와 같음 |
| `/local/hello`가 `Permission denied` | SELinux 라벨 | `ls -Z /local`로 라벨을 본다. host root 셸(super_t)에서는 허용될 것으로 예상하지만 확인 필요 |
| `echo test > /etc/hello`가 거부됐다 | `/etc`의 일부 파일은 API가 렌더링한 결과라 SELinux가 보호한다 | 새 파일 이름으로 시도한다. 기존 설정 파일 수정은 거부될 수 있다 |
| `insmod` 실행 파일이 없다 | host에 kmod 도구가 없을 수 있다 | 이 항목은 결과 확인을 건너뛴다. lockdown 상태는 `cat /sys/kernel/security/lockdown`으로 본다 |

## 정리

`/etc/hello`와 `/local/hello`는 지우지 않는다. 6장에서 재부팅 후 확인한다. admin container에 설치한 패키지도 그대로 둔다.
