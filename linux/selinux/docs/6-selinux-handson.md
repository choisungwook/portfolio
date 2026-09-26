# SELinux 실습: root 컨테이너가 host 파일을 못 읽는 이유

컨테이너 안의 root가 권한 비트상 읽을 수 있는 host 파일을 SELinux 때문에 읽지 못하는 장면을 만들고, 로그 해석, 라벨 교정, MCS 격리, privileged 컨테이너까지 순서대로 본다. 환경은 [5-setup-ec2.md](5-setup-ec2.md)다. 원리는 [1-selinux-concepts.md](1-selinux-concepts.md)에 있다.

> 확인 필요: 결과 열은 AL2023 targeted 정책과 container-selinux 동작 기준 예상이다. category 번호(`c123,c456`)는 실행마다 다르다.

모든 명령은 EC2에서 `sudo -i`한 root 셸로 실행한다. 이미지 pull 횟수 제한을 피하려고 ECR Public의 alpine을 쓴다.

```bash
IMG=public.ecr.aws/docker/library/alpine:latest
docker pull $IMG
```

## 1. 현재 상태 보기

```bash
getenforce
sestatus | grep -E "Loaded policy|Current mode|Mode from config"
docker info --format '{{.SecurityOptions}}'
```

| 명령 | 예상 결과 |
|---|---|
| `getenforce` | `Permissive`. AL2023 기본값 |
| `sestatus` | `targeted`, `permissive`, `permissive` |
| `docker info` | 목록에 `name=selinux`. daemon.json 설정이 적용됨 |

## 2. 라벨 읽기

파일, 프로세스, 컨테이너의 라벨을 차례로 본다.

```bash
ls -Z /etc/shadow
ls -Zd /srv
ps -eZ | grep -E "dockerd|containerd$"
docker run --rm $IMG cat /proc/self/attr/current; echo
```

| 대상 | 예상 라벨 |
|---|---|
| `/etc/shadow` | `system_u:object_r:shadow_t:s0` |
| `/srv` | `system_u:object_r:var_t:s0` |
| dockerd, containerd | `system_u:system_r:container_runtime_t:s0` |
| 컨테이너 프로세스 | `system_u:system_r:container_t:s0:c123,c456` |

- 컨테이너 안 프로세스는 uid 0이지만 도메인은 `container_t`다. 판정은 이 type으로 한다

## 3. permissive에서 host 파일 읽기

host에 파일을 만든다. 권한 비트는 644라서 컨테이너의 root는 DAC 검사를 통과한다.

```bash
mkdir -p /srv/lab
echo "hello from host" > /srv/lab/file.txt
ls -Z /srv/lab/file.txt
docker run --rm -v /srv/lab:/data $IMG cat /data/file.txt
```

| 단계 | 예상 결과 |
|---|---|
| `ls -Z` | `...:object_r:var_t:s0` |
| `docker run` | `hello from host`. 읽힘 |

permissive라서 읽혔지만 거부 기록은 남았다.

```bash
ausearch -m AVC -ts recent | grep file.txt
```

예상 출력이다.

```text
type=AVC msg=audit(...): avc:  denied  { read } for  pid=... comm="cat" name="file.txt" ...
  scontext=system_u:system_r:container_t:s0:c123,c456
  tcontext=unconfined_u:object_r:var_t:s0 tclass=file permissive=1
```

- 로그 한 줄에 판정 입력 4가지가 다 있다. source(`container_t`), target(`var_t`), class(`file`), 권한(`read`)
- `permissive=1`: 거부 판정이 났지만 적용하지 않았다는 뜻이다. enforcing으로 바꾸면 이 요청이 실패한다

## 4. enforcing으로 바꾸고 다시 읽기

```bash
setenforce 1
getenforce
docker run --rm -v /srv/lab:/data $IMG cat /data/file.txt
```

예상 출력이다.

```text
Enforcing
cat: can't open '/data/file.txt': Permission denied
```

- 같은 root, 같은 644 파일인데 거부된다. DAC가 아니라 SELinux가 거부했다
- 로그는 같고 `permissive=0`으로 바뀐다

## 5. 왜 거부됐는지 정책에 묻기

`audit2why`는 로그를 읽고 거부 원인을 분류한다.

```bash
ausearch -m AVC -ts recent | audit2why | head -8
```

예상 출력이다.

```text
        Was caused by:
                Missing type enforcement (TE) allow rule.
```

정책에 규칙이 있는지 `sesearch`로 직접 찾는다.

```bash
sesearch -A -s container_t -t var_t -c file -p read
sesearch -A -s container_t -t container_file_t -c file -p read
```

| 조회 | 예상 결과 |
|---|---|
| `container_t` → `var_t` | 출력 없음. allow 규칙이 없어 default deny |
| `container_t` → `container_file_t` | `allow container_t container_file_t:file { ... read ... };` |

- 결론: 컨테이너가 읽으려면 파일 type이 `container_file_t`여야 한다

## 6. audit2allow가 만드는 규칙 보기

로그를 그대로 allow 규칙으로 바꾸는 도구다. 결과만 보고 적재하지 않는다.

```bash
ausearch -m AVC -ts recent | audit2allow
```

예상 출력이다.

```text
#============= container_t ==============
allow container_t var_t:file { open read };
```

- 이 규칙을 넣으면 모든 컨테이너가 host의 모든 `var_t` 파일을 읽는다. `/var` 아래 대부분이 여기에 든다
- 거부 한 건을 풀려고 정책 목적 전체를 무너뜨리는 셈이다. 대부분은 규칙 추가가 아니라 라벨 교정이 답이다

## 7. 라벨 교정 1: docker `:Z`

`:Z`는 마운트 전에 host 디렉터리를 이 컨테이너 전용 라벨로 바꾼다.

```bash
docker run --rm -v /srv/lab:/data:Z $IMG cat /data/file.txt
ls -Z /srv/lab/file.txt
```

| 단계 | 예상 결과 |
|---|---|
| `docker run` | `hello from host` |
| `ls -Z` | `system_u:object_r:container_file_t:s0:c201,c702` |

## 8. MCS: 다른 컨테이너는 못 읽는다

`:Z`로 붙은 category는 그 컨테이너 것이다. 새 컨테이너는 다른 category를 받는다.

```bash
docker run --rm -v /srv/lab:/data $IMG sh -c 'cat /proc/self/attr/current; echo; cat /data/file.txt'
```

예상 출력이다.

```text
system_u:system_r:container_t:s0:c388,c911
cat: can't open '/data/file.txt': Permission denied
```

- type은 `container_t` → `container_file_t`로 맞지만 category가 달라 거부된다
- 같은 노드의 컨테이너끼리 볼륨을 훔쳐보지 못하게 하는 장치다

여러 컨테이너가 같이 쓰려면 소문자 `:z`로 category 없는 공유 라벨을 붙인다.

```bash
docker run --rm -v /srv/lab:/data:z $IMG true
ls -Z /srv/lab/file.txt
docker run --rm -v /srv/lab:/data $IMG cat /data/file.txt
```

| 단계 | 예상 결과 |
|---|---|
| `ls -Z` | `system_u:object_r:container_file_t:s0` |
| 새 컨테이너 | `hello from host` |

## 9. 라벨 교정 2: chcon은 사라지고 semanage는 남는다

`chcon`은 xattr만 바꾼다. `restorecon -F`가 정책의 `file_contexts`대로 되돌린다.

```bash
mkdir -p /srv/tmpfix && echo tmp > /srv/tmpfix/a.txt
chcon -R -t container_file_t /srv/tmpfix
ls -Z /srv/tmpfix/a.txt
restorecon -RFv /srv/tmpfix
```

예상 출력이다.

```text
unconfined_u:object_r:container_file_t:s0 /srv/tmpfix/a.txt
Relabeled /srv/tmpfix/a.txt from unconfined_u:object_r:container_file_t:s0 to system_u:object_r:var_t:s0
```

- `container_file_t`는 정책의 customizable type이다. `-F` 없는 `restorecon`은 이 type을 사용자가 일부러 붙인 것으로 보고 건너뛴다

`semanage fcontext`는 `file_contexts`에 규칙을 추가한다. `restorecon`이 이 규칙을 따른다.

```bash
semanage fcontext -a -t container_file_t "/srv/shared(/.*)?"
mkdir -p /srv/shared && echo shared > /srv/shared/b.txt
restorecon -Rv /srv/shared
docker run --rm -v /srv/shared:/data $IMG cat /data/b.txt
```

| 단계 | 예상 결과 |
|---|---|
| `restorecon` | `var_t` → `container_file_t`로 relabel |
| `docker run` | `shared` |

- 파일시스템 전체 relabel(`/.autorelabel`)이나 `restorecon -F`가 돌아도 이 라벨은 유지된다
- 운영 노드에서 라벨을 고칠 때는 이 방법을 쓴다

## 10. privileged 컨테이너는 SELinux 제한을 거의 받지 않는다

`/srv/lab`을 다시 `var_t`로 되돌린 뒤 privileged로 읽는다.

```bash
restorecon -RFv /srv/lab
docker run --rm --privileged -v /srv/lab:/data $IMG sh -c 'cat /proc/self/attr/current; echo; cat /data/file.txt'
docker run --rm --security-opt label=disable -v /srv/lab:/data $IMG sh -c 'cat /proc/self/attr/current; echo; cat /data/file.txt'
```

예상 출력이다.

```text
system_u:system_r:spc_t:s0
hello from host
system_u:system_r:spc_t:s0
hello from host
```

- 두 방법 모두 `spc_t`(super privileged container)로 뜬다. `var_t` 거부가 사라진다
- privileged를 주면 SELinux 격리도 함께 사라진다. Bottlerocket에서 `spc_t`가 어느 type이 되는지는 [8-bottlerocket-mapping.md](8-bottlerocket-mapping.md)에 있다

## 11. 원래대로

```bash
setenforce 0
semanage fcontext -d "/srv/shared(/.*)?"
rm -rf /srv/lab /srv/tmpfix /srv/shared
```

## 정리

| 실습 | 확인한 것 |
|---|---|
| 3, 4 | DAC를 통과한 root도 type 규칙이 없으면 거부 |
| 5, 6 | 거부 원인은 로그 한 줄의 source, target, class, 권한. 규칙 추가보다 라벨 교정 |
| 7, 8 | `:Z`는 컨테이너 전용 category, `:z`는 공유 |
| 9 | 라벨을 오래 유지하려면 `semanage fcontext` |
| 10 | privileged는 `spc_t`로 SELinux 격리를 벗어남 |
