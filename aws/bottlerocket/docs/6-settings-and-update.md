# 설정의 지속 범위와 A/B 업데이트, 롤백

설정을 어디에 넣으면 어디까지 남는지, OS 업데이트가 A/B 파티션에서 어떻게 일어나는지를 EC2 단독 인스턴스에서 확인한다. 환경은 [3-setup-ec2.md](3-setup-ec2.md)이고, A/B 실습은 latest보다 낮은 버전으로 띄웠을 때만 된다. 5장에서 만든 `/etc/hello`, `/local/hello`를 재부팅 후 확인하는 절도 여기에 있다.

> 결과 열은 Bottlerocket 공식 문서 기준 예상이다. 실측으로 확인하지 않았다(확인 필요). 실행 결과가 다르면 이 문서를 고친다.

## 원리

- 설정 원본은 host API의 설정 저장소다. `/etc`의 파일은 부팅마다 그 저장소에서 렌더링한 결과물이다
- 설정 저장소는 루트 디바이스(xvda)에 있어 재부팅을 넘긴다. 인스턴스를 교체하면 새 디바이스이므로 user data TOML만 남는다
- 루트 디바이스에는 파티션 세트가 A, B 2개 있다. 업데이트는 비활성 세트에 새 이미지를 쓰고 부팅 대상을 바꾸는 일이다
- 롤백은 부팅 대상을 다시 이전 세트로 돌리는 일이다. 이미지를 받지 않으므로 네트워크가 필요 없다

세부는 [2-concepts.md](2-concepts.md)의 설정과 업데이트 절에 있다.

## 실습 1. apiclient set은 재부팅은 넘기지만 노드 교체는 넘기지 못한다

control container에서 `motd`를 바꾸고 재부팅한다. 재부팅하면 SSM 세션이 끊긴다.

```bash
apiclient set motd="changed by apiclient"
apiclient get settings.motd
apiclient reboot
```

1~2분 뒤 다시 SSM으로 들어가 확인한다. 5장에서 만든 파일도 같이 본다. `/etc/hello`, `/local/hello`는 host 셸에서 본다.

```bash
apiclient get settings.motd
enter-admin-container
sudo sheltie
ls /etc/hello /local/hello
```

| 단계 | 위치 | 확인 | 예상 결과 |
|---|---|---|---|
| `set` 직후 | control | `apiclient get settings.motd` | `changed by apiclient` |
| 재부팅 후 | control | `apiclient get settings.motd` | `changed by apiclient`. 설정 저장소가 루트 디바이스에 있어 유지된다 |
| 재부팅 후 | host | `ls /etc/hello` | `No such file or directory`. tmpfs |
| 재부팅 후 | host | `ls /local/hello` | 있음. 데이터 볼륨 |
| 인스턴스 교체 후 | control | `apiclient get settings.motd` | user data의 `bottlerocket handson: standalone ec2`로 돌아간다 |

인스턴스 교체는 3장의 `-replace`로 재현한다. A/B 실습을 이어서 할 계획이면 교체는 A/B 실습이 끝난 뒤에 한다. 교체하면 latest로 다시 뜨기 때문이다.

```bash
terraform -chdir=terraform/ec2 apply -auto-approve -replace=aws_instance.bottlerocket
```

노드를 교체해도 남아야 하는 설정은 user data TOML에 넣는다. `apiclient set`은 장애 대응 중 임시 변경에만 쓴다. 운영 기준은 [9-operations.md](9-operations.md)에 있다.

## 실습 2. apiclient update로 A/B 세트를 바꾼다

control container에서 업데이트를 확인한다.

```bash
apiclient update check
```

- `chosen_update`에 적용할 버전이 나온다. latest로 띄웠으면 비어 있고 이 실습은 여기서 끝난다
- `available_updates`에는 이전 버전도 모두 나온다. 롤백 대상이 되기 때문이다

host 셸에서 현재 파티션 상태를 기록해 둔다.

```bash
signpost status
```

control container로 나와 업데이트를 적용하고 재부팅한다. `--check`는 적용 전에 최신 목록을 다시 조회하고, `--reboot`는 적용이 끝나면 재부팅한다.

```bash
apiclient update apply --check --reboot
```

재부팅 후 다시 들어가 버전과 파티션 상태를 본다.

```bash
apiclient get os
enter-admin-container
sudo sheltie
signpost status
```

| 단계 | 위치 | 명령 | 예상 결과 |
|---|---|---|---|
| 적용 전 | host | `signpost status` | 활성 세트 A, 비활성 세트 B |
| 적용 전 | control | `apiclient get os` | `version_id`가 3장에서 고른 이전 버전 |
| 적용 후 | control | `apiclient get os` | `version_id`가 `chosen_update` 버전 |
| 적용 후 | host | `signpost status` | 활성 세트 B |
| 적용 후 | control | `apiclient get settings.motd` | `changed by apiclient`. 설정이 새 버전으로 migration됐다 |

## 실습 3. signpost로 이전 세트로 롤백한다

host 셸에서 비활성 세트로 되돌리고 재부팅한다. 업데이트 저장소에 접속하지 않는다.

```bash
signpost rollback-to-inactive
reboot
```

재부팅 후 확인한다.

| 위치 | 명령 | 예상 결과 |
|---|---|---|
| control | `apiclient get os` | `version_id`가 적용 전 버전 |
| host | `signpost status` | 활성 세트 A |
| control | `apiclient get settings.motd` | `changed by apiclient`. 이전 버전 형식으로 다시 migration됐다 |

- 롤백한 노드는 다음 `apiclient update check`에서 다시 업데이트 대상이 된다. 자동 업데이트를 쓰면 다시 올라간다
- 부팅 자체가 실패하면 이 명령 없이도 이전 세트로 자동 복귀한다. 이 실습에서는 재현하지 않는다

## 트러블슈팅

| 증상 | 원인 | 확인과 조치 |
|---|---|---|
| `chosen_update`가 비어 있다 | 이미 latest다 | 3장의 준비 절대로 이전 버전을 골라 `-replace`로 다시 띄운다 |
| `apiclient update check`가 저장소 접속 실패 | egress가 없다 | 보안그룹 egress. private subnet이면 NAT |
| `apiclient reboot` 뒤 SSM 세션이 안 열린다 | 부팅과 SSM 재등록에 1~2분 걸린다 | `describe-instance-information`의 `PingStatus`를 본다. 5분 넘게 `Online`이 안 되면 시리얼 콘솔 출력 |
| 재부팅 후 `motd`가 user data 값으로 돌아왔다 | 재부팅이 아니라 교체됐다 | `terraform output instance_id`가 바뀌었는지 본다. `-replace`나 latest 변경이 원인이다 |
| `signpost status`가 `command not found` | control이나 admin에서 실행했다 | host 셸(`sudo sheltie`)에서 실행한다 |
| 업데이트 후 부팅이 안 된다 | 새 이미지 문제 | 자동 롤백을 기다린다. 시리얼 콘솔 출력에 부팅 실패 로그가 남는다 |
| `apiclient update apply`가 `update already in progress` | 이전 apply가 끝나지 않았다 | `apiclient update cancel` 뒤 다시 시도한다 |

## 정리

EC2 실습은 여기서 끝난다. 3장의 down으로 인스턴스를 지운다. EKS 실습을 이어서 하면 [7-setup-eks.md](7-setup-eks.md)로 간다.

```bash
terraform -chdir=terraform/ec2 destroy -auto-approve
```
