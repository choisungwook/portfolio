# SELinux와 dm-verity

Bottlerocket이 기본으로 켜 두는 두 보안 기능을 따로 떼어 이해한다. SELinux는 실행 중인 프로세스의 행동을, dm-verity는 디스크에 있는 OS 이미지의 무결성을 지킨다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-selinux-concepts.md](docs/1-selinux-concepts.md) | DAC와 MAC, LSM hook, label, Type Enforcement, 모드, AVC 로그, MCS |
| [2-dm-verity-concepts.md](docs/2-dm-verity-concepts.md) | 해시 트리, 읽기 시점 검증, 변조 시 동작, root hash 신뢰 체인 |
| [3-setup-local.md](docs/3-setup-local.md) | Docker 환경 up·down. Mac에서 되는 것과 안 되는 것 |
| [4-setup-ec2.md](docs/4-setup-ec2.md) | AL2023 t3.medium 환경 up·down |
| [5-selinux-handson.md](docs/5-selinux-handson.md) | nginx로 거부 4가지 재현과 해결. label, 경로 규칙, 포트, boolean |
| [6-dm-verity-handson.md](docs/6-dm-verity-handson.md) | 사용자 공간 변조 탐지(Docker), 커널 EIO와 재부팅(EC2) |
| [7-bottlerocket.md](docs/7-bottlerocket.md) | container_t, control_t, super_t와 루트 dm-verity를 host에서 확인 |

## 시각화

- [visualize/index.html](visualize/index.html) — SELinux 접근 판정 시뮬레이터와 dm-verity 해시 트리 변조 시뮬레이터. 브라우저로 파일을 그대로 연다

## 실습 코드

- [compose.yaml](compose.yaml), [scripts/verity-userspace.sh](scripts/verity-userspace.sh) — veritysetup 사용자 공간 검증
- [terraform/](terraform/) — Amazon Linux 2023 EC2 1대. SSM 접속만 연다
