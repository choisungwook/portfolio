# EKS Bottlerocket 노드에 긴급 접속하는 3가지 경로

장애가 난 Bottlerocket 노드에 들어가는 경로는 세 가지다. SSM Session Manager, admin container SSH, `kubectl debug node`다. 경로마다 필요한 조건과 닿는 범위가 다르다. 원리는 [1-concepts.md](1-concepts.md)의 host container 절에 있다. 환경은 [2-setup-eks.md](2-setup-eks.md)로 만든다.

> 결과 열은 Bottlerocket 공식 문서 기준 예상이다. 실측으로 확인하지 않았다(확인 필요). 실행 결과가 다르면 이 문서를 고친다.

## 경로 비교

| 경로 | 필요 조건 | 평시 설정 | 도달 범위 | kubelet이 죽었을 때 |
|---|---|---|---|---|
| 1. SSM Session Manager | 노드 role의 SSM 권한, SSM endpoint까지 네트워크 | 없음(control container 기본 켜짐) | control → admin → host root 셸 | 가능 |
| 2. admin container SSH | admin container 켜짐, SSH 키 등록, 22번 포트까지 경로 | user data로 admin 켜기 | admin → host root 셸 | 가능 |
| 3. `kubectl debug node` | API server와 kubelet 정상, 이미지 pull 가능 | 없음 | 특권 pod에서 `/host` 조회 | 불가능 |

- 평시 설정 없이 가장 깊이 들어가는 것은 경로 1이다. 이 핸즈온의 기본 경로다
- 경로 3은 노드가 Ready일 때만 쓴다. 노드가 NotReady인 장애에서는 쓸 수 없다

## 준비: 노드 인스턴스 ID

세 경로 모두 대상 노드를 먼저 정한다.

```bash
NODE=$(kubectl get nodes -l os=bottlerocket -o jsonpath='{.items[0].metadata.name}')
INSTANCE_ID=$(kubectl get node "$NODE" -o jsonpath='{.spec.providerID}' | cut -d/ -f5)
echo "$NODE $INSTANCE_ID"
```

## TOML user data가 병합됐는지 먼저 확인한다

이 핸즈온에서 가장 먼저 깨질 수 있는 곳은 user data 병합이다. launch template에는 `motd`만 넣었고, 클러스터 접속 설정은 EKS가 붙여야 한다. 인스턴스가 실제로 받은 user data를 본다.

```bash
aws ec2 describe-instance-attribute --instance-id "$INSTANCE_ID" --attribute userData \
  --query 'UserData.Value' --output text | base64 -d
```

| 확인할 것 | 예상 |
|---|---|
| `[settings] motd` | launch template에 넣은 값 그대로 |
| `[settings.kubernetes]` | EKS가 붙인 `cluster-name`, `api-server`, `cluster-certificate` |
| 노드 상태 | `kubectl get nodes`에서 Ready |

노드가 조인하지 않으면 TOML 문법부터 의심한다. 로그를 볼 수단은 EC2 시리얼 콘솔 출력과 SSM뿐이다.

```bash
aws ec2 get-console-output --instance-id "$INSTANCE_ID" --latest --output text | tail -50
```

## 경로 1. SSM으로 control, admin, host 순서로 들어간다

Session Manager로 control container에 들어간다.

```bash
aws ssm start-session --region ap-northeast-2 --target "$INSTANCE_ID"
```

control container에서 API를 조회한다. 병합된 설정이 API에도 들어갔는지 여기서 한 번 더 본다.

```bash
apiclient get settings.motd settings.kubernetes.cluster-name
apiclient get settings.host-containers.admin
```

admin container로 들어간다. `enter-admin-container`는 꺼져 있으면 `enable-admin-container`로 먼저 켜고, 최대 60초 동안 기동을 기다린 뒤 `apiclient exec admin bash`를 실행하는 스크립트다.

```bash
enter-admin-container
```

admin container에서 host root 셸로 들어간다.

```bash
sudo sheltie
```

단계마다 확인할 것은 다음과 같다.

| 위치 | 명령 | 예상 결과 |
|---|---|---|
| control | `which bash apiclient` | 둘 다 있음. control container 이미지의 도구 |
| control | `ls /usr/bin/sheltie` | 없음. sheltie는 admin container에만 있다 |
| admin | `cat /etc/os-release` | Amazon Linux 2023. admin container 이미지의 OS이고 host가 아니다 |
| host(sheltie) | `cat /etc/os-release` | `NAME=Bottlerocket` |
| host(sheltie) | `grep ' / ' /proc/mounts` | dm-verity 디바이스(`/dev/dm-0`), `ro` |
| host(sheltie) | `touch /usr/bin/hello` | `Read-only file system` |
| host(sheltie) | `cat /sys/fs/selinux/enforce` | `1`(enforcing) |

작업이 끝나면 admin container를 다시 끈다. 평시에는 꺼 두는 것이 권장 운영이다.

```bash
exit   # sheltie
exit   # admin container
disable-admin-container
```

## 경로 2. user data로 admin container SSH를 켠다

[2-setup-eks.md](2-setup-eks.md)의 준비 절처럼 `TF_VAR_admin_ssh_public_key`를 넣고 apply하면 TOML에 다음이 들어간다.

```toml
[settings.host-containers.admin]
enabled = true
user-data = "<{\"ssh\":{\"authorized-keys\":[\"ssh-ed25519 ...\"]}}를 base64로 인코딩한 값>"
```

- admin container의 `user-data`는 SSH 설정 JSON을 base64로 한 번 더 감싼다. TOML 전체를 base64로 하는 것과 별개다
- `user-data`를 주지 않으면 admin container는 IMDS에서 EC2 key pair 공개키를 가져온다

노드 보안그룹에 22번을 열지 않는다. SSM port forwarding으로 노드의 22번을 로컬 2222번에 붙인다. admin container는 host 네트워크를 쓰므로 sshd가 노드의 22번에서 듣는다.

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

## 경로 3. kubectl debug node로 특권 pod를 붙인다

`--profile=sysadmin`은 privileged pod를 만들고 노드 루트를 `/host`에 마운트한다.

```bash
kubectl debug node/"$NODE" -it --profile=sysadmin \
  --image=public.ecr.aws/amazonlinux/amazonlinux:2023 -- bash
```

pod 안에서 host를 조회하고 써 본다.

| 명령 | 예상 결과 |
|---|---|
| `ls /host/usr/bin \| head` | host 바이너리 목록. 셸이 없다 |
| `chroot /host /bin/sh` | 실패. host에 `/bin/sh`가 없다 |
| `touch /host/usr/bin/hello` | `Read-only file system` |
| `touch /host/etc/hello` | 성공 가능. `/etc`는 tmpfs라 재부팅 시 사라진다(확인 필요) |
| `touch /host/local/hello` | SELinux 라벨에 따라 거부될 수 있다(확인 필요) |
| `cat /proc/1/attr/current` | host PID 1의 SELinux 라벨 |

- privileged pod라도 SELinux 정책을 벗어나지 못한다. AL2023 노드에서 되던 hostPath 쓰기가 여기서는 거부될 수 있다
- debug pod는 끝나도 남는다. 지운다

```bash
kubectl get pod -o name | grep node-debugger | xargs kubectl delete
```

## 정리

[2-setup-eks.md](2-setup-eks.md)의 down으로 클러스터를 지운다.
