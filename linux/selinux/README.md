# SELinux와 dm-verity

Bottlerocket 노드를 지키는 두 커널 기능을 원리부터 실습한다. SELinux는 실행 중인 프로세스의 접근을, dm-verity는 디스크에 저장된 OS 바이트를 검사한다. M3 Mac의 docker로 되는 부분(dm-verity 해시 트리)과 EC2가 필요한 부분(SELinux, 커널 dm-verity)을 나눴다.

## 문서

| 문서 | 내용 |
|---|---|
| [1-selinux-concepts.md](docs/1-selinux-concepts.md) | DAC와 MAC, 라벨, 판정 흐름, 모드, 도메인 전이, MCS |
| [2-dm-verity-concepts.md](docs/2-dm-verity-concepts.md) | 해시 트리, hash device 배치, 지연 검증, 실패 동작, root hash 신뢰 체인 |
| [3-setup-local.md](docs/3-setup-local.md) | docker compose 환경 up·down |
| [4-dm-verity-local-handson.md](docs/4-dm-verity-local-handson.md) | root hash를 Python으로 다시 계산, 바이트 1개 변조 검출 |
| [5-setup-ec2.md](docs/5-setup-ec2.md) | EC2 t3.medium(AL2023 x86_64) 환경 up·down |
| [6-selinux-handson.md](docs/6-selinux-handson.md) | 컨테이너 root가 host 파일을 못 읽는 이유, avc 로그, `:z`/`:Z`, semanage, privileged |
| [7-dm-verity-kernel-handson.md](docs/7-dm-verity-kernel-handson.md) | `veritysetup open`, 읽기 전용 블록 디바이스, 변조 블록만 EIO, 재시작 옵션 |
| [8-bottlerocket-mapping.md](docs/8-bottlerocket-mapping.md) | Bottlerocket 정책 type과 "OS는 dm-verity 파일만 실행" 규칙 |

## 시각화

- [visualize/index.html](visualize/index.html) — 브라우저로 여는 단일 파일. SELinux 판정 시뮬레이터, dm-verity 해시 트리 변조 실험, Bottlerocket 실행 규칙

## 실습 코드

- [compose.yaml](compose.yaml), [dm-verity-lab/](dm-verity-lab/) — veritysetup과 root hash 재계산 스크립트
- [terraform/](terraform/) — AL2023 EC2 1대. SSM 접속만 연다

## 관련 핸즈온

- [aws/bottlerocket](../../aws/bottlerocket/) — Bottlerocket 원리와 긴급 접속
