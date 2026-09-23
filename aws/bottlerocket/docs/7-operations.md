# Bottlerocket 운영 주의사항

Bottlerocket을 EKS 노드로 운영할 때 AL2023 노드와 판단이 달라지는 지점을 모았다. 원리는 [1-concepts.md](1-concepts.md)에 있고, 이 문서는 실습에서 겪은 것이 쌓이면 갱신한다.

## 업데이트는 노드그룹 AMI 교체를 기본으로 한다

업데이트 수단은 세 가지다. 노드를 누가 관리하느냐에 따라 고른다.

| 수단 | 방식 | 맞는 노드 |
|---|---|---|
| 노드그룹 AMI 교체 | `release_version`을 올리면 EKS가 새 노드를 띄우고 기존 노드를 drain | EKS 관리형 노드그룹 |
| Bottlerocket update operator(brupop) | DaemonSet이 노드마다 `apiclient update`를 실행하고 한 대씩 재부팅 | 자체 관리 노드그룹, Karpenter 노드 |
| `apiclient update apply` 수동 | 노드 안에서 A/B 전환 | 실습, 긴급 패치 1대 |

- 관리형 노드그룹에 brupop을 함께 쓰면 역할이 겹친다. 노드는 A/B로 새 버전이 됐는데 노드그룹의 `release_version`은 이전 값이라, 다음 노드그룹 업데이트가 무엇을 기준으로 할지 흐려진다
- Karpenter는 drift 감지로 AMI가 바뀌면 노드를 교체한다. brupop을 쓸지 drift에 맡길지 하나로 정한다
- Kubernetes minor 업그레이드는 변형이 바뀌므로 어느 수단이든 노드 교체다

## 설정의 원본은 user data TOML이다

| 설정 방법 | 재부팅 | 노드 교체 | 쓰는 곳 |
|---|---|---|---|
| user data TOML | 유지 | 유지 | 모든 영구 설정 |
| `apiclient set` | 유지 | 사라짐 | 장애 대응 중 임시 변경 |
| `/etc` 파일 직접 편집 | 사라짐 | 사라짐 | 쓰지 않는다 |

- `apiclient set`으로 고친 노드는 같은 노드그룹의 다른 노드와 달라진다. 고친 내용은 바로 TOML에 옮기고 노드를 교체한다
- `settings.kubernetes` 아래 노출된 kubelet 옵션만 바꿀 수 있다. `max-pods`, `cluster-dns-ip`, eviction 임계값, registry mirror 같은 키다. 노출되지 않은 kubelet 플래그가 필요하면 Bottlerocket으로는 해결되지 않는다
- sysctl은 `settings.kernel.sysctl`로 넣는다

sysctl을 TOML로 넣는 형태는 다음과 같다. 키에 점이 들어가므로 따옴표로 감싼다.

```toml
[settings.kernel.sysctl]
"net.core.somaxconn" = "4096"
```

## 데이터 볼륨 크기는 따로 챙긴다

- 컨테이너 이미지와 로그는 `/dev/xvdb`(기본 20GiB)에 쌓인다. 큰 이미지를 여러 개 받는 노드는 먼저 여기서 DiskPressure가 난다
- 관리형 노드그룹의 `disk_size`나 launch template의 `/dev/xvda` 크기는 OS 볼륨을 바꾼다. 데이터 볼륨을 키우려면 launch template에 `/dev/xvdb` block device mapping을 따로 넣는다
- 이 핸즈온이 쓰는 terraform_practice EKS 모듈은 `/dev/xvda`만 잡는다. 그래서 데이터 볼륨은 AMI 기본 20GiB 그대로다
- 볼륨을 키운 뒤 재부팅하면 데이터 파티션이 늘어난다

## SELinux 때문에 AL2023에서 되던 hostPath 쓰기가 막힐 수 있다

- SELinux는 enforcing이고 끌 수 없다. root 권한이나 privileged 컨테이너도 정책을 따른다
- 정책의 목표는 세 가지다. API 설정 직접 수정 금지, 디스크에 저장된 컨테이너 이미지 수정 금지, 다른 컨테이너 layer 수정 금지
- hostPath로 host 경로에 쓰는 워크로드는 Bottlerocket 노드로 옮기기 전에 먼저 돌려 본다. AL2023에서 permissive라 드러나지 않던 거부가 여기서 나온다
- 로그 에이전트처럼 host 로그를 읽어야 하는 DaemonSet은 벤더가 Bottlerocket 지원을 명시했는지 확인한다

## 로그와 보안 에이전트는 DaemonSet으로 돈다

- host에 에이전트를 설치할 수 없다. 로그 수집, 보안 탐지, 메트릭 수집은 전부 DaemonSet이다
- host 에이전트 방식만 지원하는 보안 제품은 Bottlerocket에서 쓸 수 없다. 도입 전에 컨테이너 배포 방식 지원 여부를 먼저 본다
- 지원 요청용 로그 묶음은 `logdog`로 만든다. host 셸에서 실행하면 `/var/log/support/bottlerocket-logs.tar.gz`가 생긴다

노드에 들어가지 않고 kubelet 프록시로 로그 묶음을 받을 수도 있다. `logdog`를 먼저 실행해 둔 노드에서만 된다.

```bash
kubectl get --raw "/api/v1/nodes/$NODE/proxy/logs/support/bottlerocket-logs.tar.gz" > bottlerocket-logs.tar.gz
```

## admin container는 평시에 꺼 둔다

- admin container는 host root 셸로 가는 발판이다. 켜 두면 SSH 키 하나가 노드 전체의 root 권한과 같아진다
- 평시에는 user data에서 `enabled = false`로 둔다. 필요할 때 SSM 세션에서 `enter-admin-container`로 켜고, 끝나면 `disable-admin-container`로 끈다
- SSH는 보안그룹에 22번을 열지 않고 SSM port forwarding으로 붙인다. 접속 기록이 Session Manager에 남는다
- private subnet 노드는 admin container 이미지를 받을 경로(NAT 또는 ECR VPC endpoint)가 있어야 장애 때 켤 수 있다. 장애가 난 뒤에 알면 늦다

## 부팅 시 1회 작업은 bootstrap container로 한다

- AL2023의 user data 셸 스크립트 자리를 bootstrap container가 대신한다. 부팅할 때 1회 실행하는 컨테이너다
- 데이터 볼륨 사전 작업, 추가 디스크 포맷 같은 일을 여기서 한다
- 설정은 `settings.bootstrap-containers.<이름>`에 이미지와 `mode`(`once`, `always`, `off`)를 넣는다

## TOML 오류는 진단이 느리다

- TOML 문법이 틀리면 노드가 조인하지 않는다. 원인을 볼 수단은 EC2 시리얼 콘솔 출력과 SSM 세션뿐이다
- user data는 작은 단위로 늘리며 검증한다. 한 번에 여러 섹션을 넣고 조인이 실패하면 어느 줄인지 찾기 어렵다
- 넣기 전에 로컬 TOML 파서로 먼저 검사한다

```bash
python3 -c 'import sys, tomllib; tomllib.load(open(sys.argv[1], "rb")); print("ok")' user-data.toml
```

## 참고자료

- [Bottlerocket README](https://github.com/bottlerocket-os/bottlerocket/blob/develop/README.md)
- [Bottlerocket SECURITY_FEATURES](https://github.com/bottlerocket-os/bottlerocket/blob/develop/SECURITY_FEATURES.md)
- [Bottlerocket update operator](https://github.com/bottlerocket-os/bottlerocket-update-operator)
- [Bottlerocket settings reference](https://bottlerocket.dev/en/os/latest/#/api/settings/)
