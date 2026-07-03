# yum/dnf lock 로컬 재현 핸즈온

yum/dnf lock이 패키지 데이터베이스와 metadata cache를 보호하는 장치라는 점을 재현하고 관찰하는 공간이다.

## 문서

| 문서 | 설명 |
| --- | --- |
| [1. 실습 준비](./docs/1-setup.md) | Docker image build와 공통 확인 명령을 정리한다 |
| [2. yum/dnf lock은 왜 필요할까](./docs/2-why-package-lock.md) | lock이 없을 때 패키지 상태가 왜 깨질 수 있는지 정리한다 |
| [3. docker 명령어로 lock 경합 재현하기](./docs/3-reproduce-lock-contention.md) | lock holder와 dnf 명령을 동시에 실행해 경합을 만든다 |
| [4. lock 점유 프로세스 확인하기](./docs/4-debug-lock-owner.md) | lock 파일, PID, `ps`, `fuser`, `lsof`로 점유 주체를 확인한다 |
| [5. Linux 명령어로 lock 파일 잡고 풀기](./docs/5-lock-file-with-linux-command.md) | `flock` 명령으로 파일 lock의 생성과 해제를 직접 관찰한다 |

## 실행

이미지를 빌드한다.

```bash
docker build -t yum-dnf-lock-lab .
```

lock 경합을 재현한다.

```bash
docker run --rm yum-dnf-lock-lab /lab/scripts/run-lock-race.sh
```

정리한다.

```bash
docker rm -f yum-dnf-lock-debug-lab yum-dnf-lock-command-lab
```
