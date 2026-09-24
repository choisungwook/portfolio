# 첫 접속: control, admin, host 3층을 지나간다

셸이 없는 노드에 들어가는 기본 경로를 처음부터 끝까지 따라간다. SSM 세션으로 control container에 들어가고, admin container를 켜서 옮겨 가고, `sheltie`로 host root 셸을 연다. 층마다 "지금 내가 어디에 있는지"를 확인하는 것이 이 문서의 목표다. 환경은 [3-setup-ec2.md](3-setup-ec2.md)로 만든다.

> 결과 열은 Bottlerocket 공식 문서 기준 예상이다. 실측으로 확인하지 않았다(확인 필요). 실행 결과가 다르면 이 문서를 고친다.

## 원리

- host에는 셸이 없다. 셸은 host container 안에 있고, host container는 Kubernetes가 모르는 별도 containerd에서 돈다
- control container는 기본으로 켜져 있고 SSM agent를 품는다. 그래서 평시 설정 없이 SSM 세션이 열린다
- admin container는 기본으로 꺼져 있다. 켜면 sshd와 `sheltie`가 생긴다
- `sheltie`는 `nsenter`로 host PID 1의 네임스페이스에 들어가되, 셸은 admin container의 정적 bash를 빌려 쓴다. host에 셸이 없어도 root 셸이 열리는 이유다

세부는 [2-concepts.md](2-concepts.md)의 host container 절에 있다.

## 층마다 확인할 것

3층을 지나며 같은 명령을 반복한다. 결과가 층마다 달라야 한다.

| 위치 | 들어가는 법 | `cat /etc/os-release` | `which bash` | `ls /usr/bin/sheltie` |
|---|---|---|---|---|
| control | SSM 세션 직후 | Amazon Linux 2023 | 있음 | 없음 |
| admin | control에서 `enter-admin-container` | Amazon Linux 2023 | 있음 | 있음 |
| host | admin에서 `sudo sheltie` | `NAME=Bottlerocket` | 없음 | 없음 |

control과 admin의 `os-release`가 모두 Amazon Linux 2023인 점이 처음에 헷갈린다. host container 이미지의 OS이지 host가 아니다. host에 들어왔는지는 `NAME=Bottlerocket`으로 판단한다.

## 실습 1. SSM으로 control container에 들어간다

workspace 루트에서 인스턴스 ID를 꺼내 세션을 연다.

```bash
INSTANCE_ID=$(terraform -chdir=terraform/ec2 output -raw instance_id)
aws ssm start-session --region ap-northeast-2 --target "$INSTANCE_ID"
```

control container에서 host API를 조회한다. user data TOML의 `motd`가 API에 들어갔는지, admin container가 꺼져 있는지 본다.

```bash
apiclient get settings.motd
apiclient get settings.host-containers
```

| 명령 | 예상 결과 |
|---|---|
| `apiclient get settings.motd` | `bottlerocket handson: standalone ec2` |
| `apiclient get settings.host-containers` | `admin`은 `enabled: false`, `control`은 `enabled: true`. 각각 `source`에 이미지 주소 |
| `apiclient get settings.kubernetes` | 비어 있거나 기본값만. 클러스터 설정이 없다 |
| `which bash apiclient` | 둘 다 있음. control container 이미지의 도구 |
| `ls /usr/bin/sheltie` | 없음. sheltie는 admin container에만 있다 |

## 실습 2. admin container를 켜고 들어간다

`enter-admin-container`는 admin이 꺼져 있으면 `enable-admin-container`로 먼저 켜고, 최대 60초 동안 기동을 기다린 뒤 `apiclient exec admin bash`를 실행하는 스크립트다.

```bash
enter-admin-container
```

admin container에서 확인한다. 여기에는 일반 Linux 도구가 있다.

```bash
cat /etc/os-release
which sheltie lsblk dnf
sudo lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS
```

| 명령 | 예상 결과 |
|---|---|
| `cat /etc/os-release` | Amazon Linux 2023. admin container 이미지의 OS이고 host가 아니다 |
| `which sheltie lsblk dnf` | 셋 다 있음 |
| `sudo lsblk` | `nvme0n1`(2GiB, OS)에 파티션 여러 개, `nvme1n1`(20GiB, 데이터) |

- `nvme0n1`의 파티션이 A 세트와 B 세트다. 같은 구성이 2번 반복된다
- admin container는 host 네트워크와 host PID 네임스페이스를 공유하므로 `ps aux`에 host의 kubelet, containerd가 나온다

## 실습 3. sheltie로 host root 셸을 연다

```bash
sudo sheltie
```

host에서 확인한다. 이 셸은 admin container에서 빌려 온 bash이고, 파일시스템과 프로세스는 host의 것이다.

```bash
cat /etc/os-release
grep ' / ' /proc/mounts
grep ' /etc ' /proc/mounts
cat /sys/fs/selinux/enforce
systemctl status kubelet --no-pager
systemctl list-units 'host-containers@*' --no-pager
```

| 명령 | 예상 결과 |
|---|---|
| `cat /etc/os-release` | `NAME=Bottlerocket`, `VARIANT_ID=aws-k8s-1.36` |
| `grep ' / ' /proc/mounts` | 루트는 `/dev/dm-0`, 옵션에 `ro`. dm-verity 디바이스 |
| `grep ' /etc ' /proc/mounts` | `tmpfs` |
| `cat /sys/fs/selinux/enforce` | `1`(enforcing) |
| `systemctl status kubelet` | 실패 또는 재시작 반복. 클러스터 설정이 없어서다 |
| `systemctl list-units 'host-containers@*'` | `host-containers@control`, `host-containers@admin`이 active |
| `ls /bin/sh /usr/bin/python3` | `No such file or directory` |

kubelet이 실패 상태여도 SSM 세션과 admin container는 동작했다. EKS 노드가 NotReady일 때도 이 경로로 들어갈 수 있다는 근거이고, [8-eks-emergency-access.md](8-eks-emergency-access.md)에서 그 상황을 재현한다.

## 실습 4. 나오는 순서와 admin container 끄기

들어간 순서의 반대로 나온다. 평시에는 admin container를 꺼 두는 것이 권장 운영이다.

```bash
exit   # sheltie → admin container
exit   # admin container → control container
disable-admin-container
apiclient get settings.host-containers.admin.enabled
```

`enabled: false`로 돌아와야 한다.

## 선택. admin container에 SSH로 바로 들어간다

3장에서 `TF_VAR_admin_ssh_public_key`를 넘겨 띄웠을 때만 된다. control container를 거치지 않고 admin container로 직접 들어가는 경로다.

- admin container는 host 네트워크를 쓰므로 sshd가 노드의 22번에서 듣는다
- 보안그룹에 22번을 열지 않고 SSM port forwarding으로 노드의 22번을 로컬 2222번에 붙인다

```bash
aws ssm start-session --region ap-northeast-2 --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["22"],"localPortNumber":["2222"]}'
```

다른 터미널에서 접속한다. 사용자는 `ec2-user`다.

```bash
ssh -p 2222 ec2-user@localhost
sudo sheltie
```

| 상황 | 예상 결과 |
|---|---|
| admin container 꺼짐 | port forwarding은 열리지만 `ssh`가 연결 거부. host에 sshd가 없다 |
| admin container 켜짐, 키 일치 | admin container 셸. `sudo sheltie`로 host root 셸 |
| 등록하지 않은 키 | `Permission denied (publickey)` |

user data에서 admin container를 켜는 TOML 형태는 다음과 같다. `user-data`는 SSH 설정 JSON을 base64로 한 번 더 감싼 값이고, TOML 전체를 base64로 하는 것과 별개다.

```toml
[settings.host-containers.admin]
enabled = true
user-data = "<{\"ssh\":{\"authorized-keys\":[\"ssh-ed25519 ...\"]}}를 base64로 인코딩한 값>"
```

`user-data`를 주지 않으면 admin container는 IMDS에서 EC2 key pair 공개키를 가져온다.

## 트러블슈팅

| 증상 | 원인 | 확인과 조치 |
|---|---|---|
| `enter-admin-container`가 60초 뒤 실패 | admin container 이미지를 받지 못했다 | control에서 `apiclient get settings.host-containers.admin.source`로 이미지 주소를 보고, host에서 `journalctl -u host-containers@admin --no-pager \| tail`. private subnet이면 NAT나 ECR VPC endpoint가 필요하다 |
| `sheltie: command not found` | control container에서 실행했다 | admin container로 먼저 들어간다. sheltie는 admin에만 있다 |
| host에서 `ls`, `cat`은 되는데 `vi`, `less`가 없다 | host 바이너리만 실행된다 | admin container로 나와 `/proc/1/root/<경로>`로 host 파일을 연다. admin container는 host PID 네임스페이스를 공유한다 |
| `apiclient`가 host에서 안 된다 | `apiclient`는 control container 도구다 | host에도 `/usr/bin/apiclient`가 있다. 없으면 control로 나온다 |
| 어느 층에 있는지 모르겠다 | 프롬프트가 비슷하다 | `cat /etc/os-release`. `NAME=Bottlerocket`이면 host, 아니면 host container |
| SSM 세션이 갑자기 끊긴다 | 재부팅했거나 세션 유휴 시간 초과 | `PingStatus`가 `Online`이 되면 다시 연다 |

## 정리

인스턴스는 그대로 두고 [5-cannot-do.md](5-cannot-do.md)로 넘어간다. admin container만 꺼 둔다.
