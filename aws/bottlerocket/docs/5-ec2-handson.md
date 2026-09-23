# EC2 단독 Bottlerocket에서 구조, 설정, A/B 업데이트 확인

클러스터 없이 띄운 Bottlerocket EC2에서 네 가지를 본다. host container 구조, 볼륨과 파티션, `apiclient` 설정의 지속 범위, A/B 전환과 롤백이다. 원리는 [1-concepts.md](1-concepts.md)에 있고, 환경은 [4-setup-ec2.md](4-setup-ec2.md)로 만든다. A/B 실습을 하려면 latest보다 낮은 버전으로 띄운다.

> 결과 열은 Bottlerocket 공식 문서 기준 예상이다. 실측으로 확인하지 않았다(확인 필요). 실행 결과가 다르면 이 문서를 고친다.

접속은 SSM Session Manager로 한다. 이후 명령은 표의 "위치" 열이 가리키는 셸에서 실행한다.

```bash
INSTANCE_ID=$(terraform -chdir=terraform/ec2 output -raw instance_id)
aws ssm start-session --region ap-northeast-2 --target "$INSTANCE_ID"
```

| 위치 | 들어가는 법 |
|---|---|
| control | SSM 세션 직후 |
| admin | control에서 `enter-admin-container` |
| host | admin에서 `sudo sheltie` |

## host container는 orchestrator 밖에서 돈다

control container에서 host container 설정을 본다.

```bash
apiclient get settings.host-containers
```

| 위치 | 명령 | 예상 결과 |
|---|---|---|
| control | `apiclient get settings.host-containers` | `admin`(enabled false), `control`(enabled true). 각각 `source`에 이미지 주소 |
| control | `apiclient get settings.kubernetes` | 비어 있거나 기본값만. 클러스터 설정이 없다 |
| host | `systemctl status kubelet --no-pager` | 실패 또는 재시작 반복. 클러스터 설정이 없어서다 |
| host | `systemctl list-units 'host-containers@*' --no-pager` | `host-containers@control`, `host-containers@admin`이 active |

kubelet이 죽어 있어도 SSM 세션과 admin container는 동작한다. EKS 노드가 NotReady일 때도 경로 1로 들어갈 수 있는 이유가 이것이다.

## 볼륨은 OS와 데이터로 나뉜다

admin container에는 `util-linux`가 있다. 블록 디바이스를 본다.

```bash
sudo lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS
```

| 위치 | 명령 | 예상 결과 |
|---|---|---|
| admin | `sudo lsblk` | `nvme0n1`(2GiB, OS)에 파티션 여러 개, `nvme1n1`(20GiB, 데이터) |
| host | `grep ' / ' /proc/mounts` | 루트는 `/dev/dm-0`, `ro` |
| host | `grep -E ' /local \| /var \| /opt ' /proc/mounts` | 데이터 디바이스의 파티션, `rw` |
| host | `grep ' /etc ' /proc/mounts` | `tmpfs` |

- Nitro 인스턴스라 `/dev/xvda`, `/dev/xvdb`가 `nvme0n1`, `nvme1n1`로 보인다
- `nvme0n1`의 파티션이 A 세트와 B 세트다. 같은 구성이 두 번 반복된다

## apiclient set은 재부팅은 넘기지만 노드 교체는 넘기지 못한다

control container에서 `motd`를 바꾸고 재부팅한다.

```bash
apiclient set motd="changed by apiclient"
apiclient get settings.motd
apiclient reboot
```

1~2분 뒤 다시 SSM으로 들어가 확인한다.

```bash
apiclient get settings.motd
```

| 단계 | 예상 결과 |
|---|---|
| `set` 직후 | `changed by apiclient` |
| 재부팅 후 | `changed by apiclient`. 설정 저장소가 루트 디바이스에 있어 유지된다 |
| 인스턴스 교체 후 | user data의 `bottlerocket handson: standalone ec2`로 돌아간다 |

인스턴스 교체는 terraform으로 재현한다.

```bash
terraform -chdir=terraform/ec2 apply -auto-approve -replace=aws_instance.bottlerocket
```

노드를 교체해도 남아야 하는 설정은 user data TOML에 넣는다. `apiclient set`은 장애 대응 중 임시 변경에만 쓴다.

## /etc에 쓴 파일은 재부팅하면 사라진다

host 셸에서 `/etc`에 파일을 만들고 재부팅한다.

```bash
echo test > /etc/hello
ls -l /etc/hello
```

재부팅 후 `ls /etc/hello`는 `No such file or directory`여야 한다. 같은 실험을 `/local/hello`로 하면 파일이 남는다.

## apiclient update로 A/B 세트를 바꾼다

control container에서 업데이트를 확인한다.

```bash
apiclient update check
```

- `chosen_update`에 적용할 버전이 나온다. latest로 띄웠으면 비어 있다
- `available_updates`에는 이전 버전도 모두 나온다. 롤백 대상이 되기 때문이다

host 셸에서 현재 파티션 상태를 기록해 둔다.

```bash
signpost status
```

업데이트를 적용하고 재부팅한다.

```bash
apiclient update apply --check --reboot
```

재부팅 후 다시 들어가 버전과 파티션 상태를 본다.

```bash
apiclient get os
```

| 단계 | 위치 | 명령 | 예상 결과 |
|---|---|---|---|
| 적용 전 | host | `signpost status` | 활성 세트 A, 비활성 세트 B |
| 적용 후 | control | `apiclient get os` | `version_id`가 `chosen_update` 버전 |
| 적용 후 | host | `signpost status` | 활성 세트 B |

## signpost로 이전 세트로 롤백한다

host 셸에서 비활성 세트로 되돌리고 재부팅한다. 업데이트 저장소에 접속하지 않는다.

```bash
signpost rollback-to-inactive
reboot
```

재부팅 후 `apiclient get os`의 `version_id`가 적용 전 버전이고, `signpost status`의 활성 세트가 다시 A여야 한다.

- 업데이트한 버전에서 바꾼 설정은 이전 버전 형식으로 migration된다
- 롤백한 노드는 다음 `apiclient update check`에서 다시 업데이트 대상이 된다. 자동 업데이트를 쓰면 다시 올라간다

## 정리

[4-setup-ec2.md](4-setup-ec2.md)의 down으로 인스턴스를 지운다.
