# 로컬 실습 환경 (docker compose)

dm-verity 해시 트리 계산 실습용 컨테이너 1개를 띄운다. `veritysetup format`과 `verify`는 파일만 읽고 쓰므로 M3 Mac의 Docker Desktop에서도 동작한다. SELinux와 `veritysetup open`은 host 커널이 필요해 [5-setup-ec2.md](5-setup-ec2.md)의 EC2를 쓴다.

## 만들어지는 것

| 대상 | 값 |
|---|---|
| 컨테이너 | `verity-lab`. debian:trixie-slim + cryptsetup-bin, python3 |
| 볼륨 | `verity-work`. 실습 파일을 `/work`에 둔다 |
| 스크립트 | `/lab/verity_tree.py`. root hash를 hashlib로 다시 계산 |

## up

workspace 루트(`linux/selinux`)에서 실행한다.

```bash
docker compose up -d --build
```

## down

```bash
docker compose down -v
```
