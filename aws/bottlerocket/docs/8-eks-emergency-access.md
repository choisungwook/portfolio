# NotReady 노드에 긴급 접속하는 3가지 경로

Bottlerocket 노드에 들어가는 경로는 3가지다. SSM Session Manager, admin container SSH, `kubectl debug node`다. 평시에는 셋 다 되므로 차이가 드러나지 않는다. 그래서 kubelet을 일부러 멈춰 노드를 NotReady로 만든 뒤 어느 경로가 남는지 비교한다. 환경은 [7-setup-eks.md](7-setup-eks.md)로 만든다. control, admin, host 3층을 지나는 절차 자체는 [4-first-access.md](4-first-access.md)와 같다.

> 결과 열은 Bottlerocket 공식 문서 기준 예상이다. 실측으로 확인하지 않았다(확인 필요). 실행 결과가 다르면 이 문서를 고친다.

## 원리

| 경로 | 필요 조건 | 평시 설정 | 닿는 범위 | kubelet이 멈췄을 때 |
|---|---|---|---|---|
| 1. SSM Session Manager | 노드 role의 SSM 권한, SSM endpoint까지 네트워크 | 없음(control container 기본 켜짐) | control → admin → host root 셸 | 가능 |
| 2. admin container SSH | admin container 켜짐, SSH 키 등록, 22번 포트까지 경로 | user data로 admin 켜기 | admin → host root 셸 | 가능 |
| 3. `kubectl debug node` | API server와 kubelet 정상, 이미지 pull 가능 | 없음 | 특권 pod에서 `/host` 조회 | 불가능 |

- 경로 1과 2는 host container를 지난다. host container는 kubelet과 무관한 containerd에서 돌므로 kubelet이 멈춰도 살아 있다
- 경로 3은 kubelet이 pod를 띄워야 한다. 노드가 NotReady면 pod가 Pending에 머문다
- 평시 설정 없이 가장 깊이 들어가는 것은 경로 1이다. 이 핸즈온의 기본 경로다

## 준비. 노드와 인스턴스를 정한다

3가지 경로 모두 대상 노드를 먼저 정한다.

```bash
NODE=$(kubectl get nodes -l os=bottlerocket -o jsonpath='{.items[0].metadata.name}')
INSTANCE_ID=$(kubectl get node "$NODE" -o jsonpath='{.spec.providerID}' | cut -d/ -f5)
echo "$NODE $INSTANCE_ID"
```

user data 병합이 됐는지 먼저 본다. 7장의 "노드가 조인하지 않을 때" 절과 같은 명령이다. 노드가 Ready면 병합은 된 것이고, 이 절은 EKS가 붙인 값을 눈으로 보는 목적이다.

```bash
aws ec2 describe-instance-attribute --region ap-northeast-2 --instance-id "$INSTANCE_ID" \
  --attribute userData --query 'UserData.Value' --output text | base64 -d
```

## 실습 1. 평시에 경로 3으로 들어간다

노드가 Ready인 동안 `kubectl debug node`를 먼저 해 본다. `--profile=sysadmin`은 privileged pod를 만들고 노드 루트를 `/host`에 마운트한다.

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

- privileged pod라도 SELinux 정책을 벗어나지 못한다. AL2023 노드에서 되던 hostPath 쓰기가 거부될 수 있다
- 경로 3은 host 파일시스템을 조회하고 로그를 읽는 데는 충분하다. `systemctl`처럼 host의 systemd에 명령을 보내는 일은 되지 않는다
- debug pod는 끝나도 남는다. 지운다

```bash
kubectl get pod -o name | grep node-debugger | xargs kubectl delete
```

## 실습 2. 장애를 재현한다. kubelet을 멈춘다

SSM으로 control에 들어가 admin을 거쳐 host 셸까지 간다. 4장과 같은 절차다.

```bash
aws ssm start-session --region ap-northeast-2 --target "$INSTANCE_ID"
enter-admin-container
sudo sheltie
```

host 셸에서 kubelet을 멈추고, 세션은 그대로 둔다.

```bash
systemctl stop kubelet
systemctl status kubelet --no-pager
```

다른 터미널에서 노드 상태를 본다. 40초쯤 지나면 NotReady가 된다.

```bash
kubectl get nodes -w
```

| 확인 | 예상 결과 |
|---|---|
| `systemctl status kubelet` | `inactive (dead)` |
| `kubectl get nodes` | 40초 뒤 `NotReady` |
| 열어 둔 SSM 세션 | 그대로 살아 있다 |

## 실습 3. NotReady에서 3가지 경로를 다시 시도한다

경로 3부터 다시 한다. pod가 뜨지 않아야 한다.

```bash
kubectl debug node/"$NODE" -it --profile=sysadmin \
  --image=public.ecr.aws/amazonlinux/amazonlinux:2023 -- bash
```

| 경로 | 명령 | 예상 결과 |
|---|---|---|
| 3. `kubectl debug node` | 위 명령 | pod가 `Pending`에 머문다. kubelet이 없어 스케줄된 pod를 띄우지 못한다 |
| 1. SSM | 새 터미널에서 `aws ssm start-session --target "$INSTANCE_ID"` | 열린다. control container의 SSM agent는 kubelet과 무관하다 |
| 2. admin SSH | 아래 port forwarding 후 `ssh -p 2222 ec2-user@localhost` | admin container가 켜져 있으면 열린다 |

경로 2는 admin container가 켜져 있어야 한다. 실습 2에서 `enter-admin-container`로 켰으므로 지금은 켜져 있다. 노드 보안그룹에 22번을 열지 않고 SSM port forwarding으로 노드의 22번을 로컬 2222번에 붙인다. 7장에서 공개키를 넘겼을 때만 로그인된다.

```bash
aws ssm start-session --region ap-northeast-2 --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["22"],"localPortNumber":["2222"]}'
```

다른 터미널에서 접속한다.

```bash
ssh -p 2222 ec2-user@localhost
sudo sheltie
```

| 상황 | 예상 결과 |
|---|---|
| admin container 켜짐, 키 일치 | admin container 셸. `sudo sheltie`로 host root 셸 |
| 공개키를 안 넘겼다 | `Permission denied (publickey)` |
| admin container 꺼짐 | port forwarding은 열리지만 `ssh`가 연결 거부. host에 sshd가 없다 |

Pending에 머문 debug pod는 지운다.

```bash
kubectl get pod -o name | grep node-debugger | xargs kubectl delete
```

## 실습 4. 복구한다

host 셸에서 kubelet을 다시 올린다.

```bash
systemctl start kubelet
```

다른 터미널에서 노드가 Ready로 돌아오는지 본다.

```bash
kubectl get nodes -w
```

Ready가 되면 들어간 순서의 반대로 나오고 admin container를 끈다.

```bash
exit   # sheltie
exit   # admin container
disable-admin-container
```

- 이 실습에서 host에 남는 변경은 없다. `systemctl stop`은 unit 파일을 건드리지 않고, 재부팅하면 kubelet은 원래대로 시작한다
- 운영에서 kubelet이 멈춘 노드를 만나면 로그부터 확보한다. host 셸에서 `journalctl -u kubelet --no-pager | tail -100`, 지원 요청용 묶음은 `logdog`다. [9-operations.md](9-operations.md)의 에이전트 절에 있다

## 트러블슈팅

| 증상 | 원인 | 확인과 조치 |
|---|---|---|
| `NODE`가 비어 있다 | label `os=bottlerocket`이 없다 | `kubectl get nodes --show-labels`. 노드그룹 label은 [terraform/eks/eks.tf](../terraform/eks/eks.tf)에 있다 |
| `start-session`이 `TargetNotConnected` | 노드 role에 SSM 권한이 없거나 SSM endpoint까지 네트워크가 없다 | `aws ssm describe-instance-information`으로 등록 여부. 모듈 기본 role은 SSM 정책을 포함한다 |
| `enter-admin-container`가 60초 뒤 실패 | admin container 이미지를 받지 못했다 | [4-first-access.md](4-first-access.md)의 트러블슈팅. default VPC의 public subnet이면 pull 경로는 있다 |
| debug pod가 `ImagePullBackOff` | 노드에서 public.ecr.aws에 닿지 못한다 | 노드 보안그룹 egress. 노드가 Ready인데도 이 오류면 네트워크다 |
| kubelet을 멈췄는데 노드가 Ready로 남아 있다 | node-monitor-grace-period(기본 40초)가 안 지났다 | 1분 기다린다 |
| `systemctl stop kubelet`이 거부됐다 | host 셸이 아니다 | `cat /etc/os-release`. host 셸(super_t)에서는 허용될 것으로 예상하지만 확인 필요 |
| `ssh`가 `Connection refused` | admin container가 꺼져 있다 | control에서 `apiclient get settings.host-containers.admin.enabled`. 꺼져 있으면 `enable-admin-container` |
| 관리형 노드그룹이 NotReady 노드를 교체했다 | 노드그룹 health check | 실습 3을 40초~수 분 안에 끝낸다. 교체되면 `NODE`와 `INSTANCE_ID`를 다시 잡는다 |

## 정리

[7-setup-eks.md](7-setup-eks.md)의 down으로 클러스터를 지운다.
