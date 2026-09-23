# Bottlerocket host에서 못 하는 것

AL2023 노드에서 습관처럼 하던 작업이 Bottlerocket host에서 어떻게 거부되는지 정리한다. 모두 host root 셸(`sudo sheltie`)에서 시도한다. 환경은 [4-setup-ec2.md](4-setup-ec2.md)나 [2-setup-eks.md](2-setup-eks.md) 어느 쪽이든 된다. 거부되는 이유는 [1-concepts.md](1-concepts.md)의 구조 하나로 설명된다.

> 결과 열은 Bottlerocket 공식 문서 기준 예상이다. 실측으로 확인하지 않았다(확인 필요). 실행 결과가 다르면 이 문서를 고친다.

## 요약

| 하려는 일 | 명령 | 예상 결과 | 막는 구조 |
|---|---|---|---|
| host에 SSH | `ssh -p 2222 ec2-user@localhost`(SSM port forwarding) | admin container가 꺼져 있으면 연결 거부 | host에 sshd 없음 |
| 패키지 설치 | `dnf install -y htop` | `command not found` | host에 패키지 관리자 없음 |
| 루트 파일시스템 쓰기 | `touch /usr/bin/hello` | `Read-only file system` | 읽기 전용 마운트, dm-verity |
| host 바이너리 추가 | `echo x > /usr/sbin/myagent` | `Read-only file system` | 실행 경로 전체가 루트 파일시스템 |
| cron 등록 | `crontab -l` | `command not found` | host에 cron 없음 |
| systemd timer 추가 | `/etc/systemd/system`에 unit 작성 | 작성은 되지만 재부팅 시 사라짐 | `/etc`가 tmpfs |
| 설정 파일 편집 | `/etc/containerd/config.toml` 수정 | 재부팅 시 원래대로 | 부팅마다 API 설정에서 렌더링 |
| 서명 없는 커널 모듈 적재 | `insmod ./my.ko` | 거부 | kernel lockdown integrity |
| SELinux 끄기 | `setenforce 0` | 명령이 없거나 거부 | enforcing 고정 |

## 셸도 host의 것이 아니다

sheltie로 연 셸은 admin container의 정적 bash다. host 파일시스템에서 셸을 찾으면 없다.

```bash
ls /bin/sh /bin/bash /usr/bin/python3
```

세 경로 모두 `No such file or directory`가 예상된다. 스크립트를 host에 올려 실행하는 방식의 운영 도구는 Bottlerocket에서 쓸 수 없다.

## 패키지는 admin container 안에만 설치된다

admin container는 Amazon Linux 2023 이미지라 `dnf`가 있다. 여기서 설치한 도구는 admin container 안에만 있고 host에는 없다.

```bash
sudo dnf install -y tcpdump
```

- admin container에서 `tcpdump`는 동작한다. host 네트워크를 쓰므로 노드의 인터페이스를 볼 수 있다
- `sudo sheltie`로 host에 들어가면 `tcpdump`는 없다
- admin container를 끄고 켜도 설치한 패키지가 남는지는 확인 필요

## 쓸 수 있는 곳은 /local뿐이다

host 셸에서 쓰기가 되는 곳은 `/etc`(tmpfs)와 `/local`(데이터 볼륨)이다. 둘의 차이는 재부팅 후에 드러난다.

```bash
echo test > /etc/hello
echo test > /local/hello
```

- 재부팅 후 `/etc/hello`는 사라지고 `/local/hello`는 남는다
- `/local`에 바이너리를 두고 실행할 수 있는지는 SELinux 라벨에 달렸다(확인 필요). 되더라도 OS가 관리하지 않는 상태라 노드 교체 때 사라진다

## 그래서 host 에이전트는 DaemonSet으로 옮긴다

host에 설치할 수 없으므로 로그 수집, 보안 에이전트, 모니터링은 전부 컨테이너로 돈다. 운영에서 무엇이 달라지는지는 [7-operations.md](7-operations.md)에 있다.
