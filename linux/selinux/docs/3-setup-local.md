# 로컬 실습 환경 (dm-verity 사용자 공간)

M3 Mac의 Docker로 dm-verity 해시 트리 생성과 변조 탐지를 실습한다. SELinux 실습은 이 환경에서 할 수 없어 [4-setup-ec2.md](4-setup-ec2.md)를 쓴다.

## 이 환경으로 되는 것과 안 되는 것

| 실습 | Docker on Mac | 이유 |
|---|---|---|
| dm-verity 해시 트리 생성, 검증, 변조 탐지 | 됨 | `veritysetup verify`는 커널 없이 사용자 공간에서 해시를 계산한다 |
| dm-verity 디바이스 마운트, 읽기 중 EIO | 안 됨 | device-mapper 커널 모듈과 privileged 컨테이너가 필요하다 |
| SELinux enforcing | 안 됨 | SELinux는 커널 LSM이다. 컨테이너는 Docker Desktop VM의 커널을 공유하고, 그 커널은 SELinux를 켜고 부팅하지 않는다 |

## 준비

- Docker Desktop 또는 OrbStack

## up

```bash
docker compose up -d --build
```

## down

```bash
docker compose down -v
```
